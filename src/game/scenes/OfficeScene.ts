import Phaser from "phaser";
import { createCharacterAnims } from "../anims/CharacterAnims";
import AgentSprite, { type ChairData } from "../characters/AgentSprite";

type Direction = "up" | "down" | "left" | "right";

interface AgentDef {
  id: string;
  name: string;
  texture: string;
  color: string;
  chairIndex: number; // index into deskChairs array
}

/**
 * Right-side office desk chairs, ordered by Tiled object index.
 * Each entry: [tiledX, tiledY, direction]
 * These map to the Chair objects in the Tiled map.
 */
const DESK_CHAIR_TILED: [number, number, Direction][] = [
  // Row 1 upper (y=480, facing down toward computers)
  [1184, 480, "down"],   // 0: chair 19
  [1088, 480, "down"],   // 1: chair 20
  // Row 1 lower (y=576, facing up toward computers)
  [992, 576, "up"],      // 2: chair 18
  [1088, 576, "up"],     // 3: chair 17
  [1184, 576, "up"],     // 4: chair 16
  // Row 2 upper (y=736, facing down)
  [992, 736, "down"],    // 5: chair 23
  [1088, 736, "down"],   // 6: chair 22
  [1184, 736, "down"],   // 7: chair 21
];

/** Meeting room chairs (conference table in left area) */
const MEETING_CHAIR_TILED: [number, number, Direction][] = [
  [448, 282, "right"],
  [448, 328, "right"],
  [544, 282, "left"],
  [544, 328, "left"],
  // Extra seats from the auditorium row
  [224, 416, "down"],
  [288, 416, "down"],
  [480, 416, "down"],
  [544, 416, "down"],
];

function tiledChairToPhaser(
  tx: number, ty: number, dir: Direction,
  itemW: number, itemH: number,
): ChairData {
  return {
    phaserX: tx + itemW * 0.5,
    phaserY: ty - itemH * 0.5,
    depth: ty - itemH * 0.5,
    direction: dir,
  };
}

export default class OfficeScene extends Phaser.Scene {
  private agents: AgentSprite[] = [];
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;

  private onAgentClick?: (id: string) => void;
  private agentDefs: AgentDef[] = [];

  private deskChairs: ChairData[] = [];
  private meetingChairs: ChairData[] = [];

  private minimapCam!: Phaser.Cameras.Scene2D.Camera;
  private minimapViewport!: Phaser.GameObjects.Graphics;
  private minimapBorder!: Phaser.GameObjects.Graphics;
  private clickedMinimap = false;
  private readonly MM_W = 200;
  private MM_H = 140;
  private readonly MM_PAD = 14;

  constructor() {
    super("office");
  }

  init() {
    this.agentDefs = this.registry.get("agentDefs") ?? [];
    this.onAgentClick = this.registry.get("onAgentClick");

    // Pre-calculate chair Phaser positions (chair sprites: 32x64)
    this.deskChairs = DESK_CHAIR_TILED.map(
      ([x, y, d]) => tiledChairToPhaser(x, y, d, 32, 64),
    );
    this.meetingChairs = MEETING_CHAIR_TILED.map(
      ([x, y, d]) => tiledChairToPhaser(x, y, d, 32, 64),
    );
  }

  create() {
    createCharacterAnims(this.anims);

    this.map = this.make.tilemap({ key: "tilemap" });

    // --- Ground tile layer with collision ---
    const floorTileset = this.map.addTilesetImage("FloorAndGround", "tiles_wall");
    if (floorTileset) {
      const layer = this.map.createLayer("Ground", floorTileset);
      if (layer) {
        layer.setCollisionByProperty({ collides: true });
        this.groundLayer = layer;
      }
    }

    // --- Items (chairs, computers, whiteboards, vendingmachines) ---
    // Following SkyOffice: chairs have NO collision
    this.addItemGroup("Chair", "chairs", "chair");
    const computers = this.addItemGroup("Computer", "computers", "computer");
    // Adjust computer depth like SkyOffice
    if (computers) {
      computers.getChildren().forEach((child) => {
        const s = child as Phaser.Physics.Arcade.Sprite;
        s.setDepth(s.y + s.height * 0.27);
      });
    }
    this.addItemGroup("Whiteboard", "whiteboards", "whiteboard");
    const vendingMachines = this.addItemGroup("VendingMachine", "vendingmachines", "vendingmachine");

    // --- Object layers (SkyOffice pattern) ---
    this.addGroupFromTiled("Wall", "tiles_wall", "FloorAndGround", false);
    this.addGroupFromTiled("Objects", "office", "Modern_Office_Black_Shadow", false);
    const objCollide = this.addGroupFromTiled("ObjectsOnCollide", "office", "Modern_Office_Black_Shadow", true);
    this.addGroupFromTiled("GenericObjects", "generic", "Generic", false);
    const genCollide = this.addGroupFromTiled("GenericObjectsOnCollide", "generic", "Generic", true);
    const basementCollide = this.addGroupFromTiled("Basement", "basement", "Basement", true);

    // --- Spawn agents ---
    for (const def of this.agentDefs) {
      const chair = this.deskChairs[def.chairIndex] ?? this.deskChairs[0];

      const agent = new AgentSprite(this, chair.phaserX, chair.phaserY, {
        id: def.id,
        name: def.name,
        texture: def.texture,
        color: def.color,
      });
      agent.deskChair = chair;
      agent.setWalkableCheck((wx, wy) => this.isTileWalkable(wx, wy));

      // SkyOffice collision pattern: ground + vendingMachines + collidable groups
      if (this.groundLayer) {
        this.physics.add.collider([agent, agent.playerContainer], this.groundLayer);
      }
      if (vendingMachines) {
        this.physics.add.collider([agent, agent.playerContainer], vendingMachines);
      }
      if (objCollide) {
        this.physics.add.collider([agent, agent.playerContainer], objCollide);
      }
      if (genCollide) {
        this.physics.add.collider([agent, agent.playerContainer], genCollide);
      }
      if (basementCollide) {
        this.physics.add.collider([agent, agent.playerContainer], basementCollide);
      }

      agent.setInteractive({ useHandCursor: true });
      agent.on("pointerdown", () => this.onAgentClick?.(def.id));
      this.agents.push(agent);
    }

    // --- Camera ---
    this.cameras.main.zoom = 1.5;
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.centerOn(1050, 620);

    this.setupInput();
    this.setupMinimap();

    // All agents start sitting at their desk
    for (const agent of this.agents) {
      agent.sitAtDeskImmediate();
    }
  }

  private setupInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerOnMinimap(pointer)) {
        this.clickedMinimap = true;
        const wp = this.minimapCam.getWorldPoint(pointer.x, pointer.y);
        this.cameras.main.pan(wp.x, wp.y, 300, "Power2");
      } else {
        this.clickedMinimap = false;
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.clickedMinimap) return;
      const cam = this.cameras.main;
      cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
      cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
    });

    this.input.on("pointerup", () => {
      this.clickedMinimap = false;
    });

    this.input.on("wheel", (_p: Phaser.Input.Pointer, _g: unknown[], _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.8, 3));
    });
  }

  private isPointerOnMinimap(pointer: Phaser.Input.Pointer): boolean {
    if (!this.minimapCam) return false;
    const { x, y, width, height } = this.minimapCam;
    return (
      pointer.x >= x && pointer.x <= x + width &&
      pointer.y >= y && pointer.y <= y + height
    );
  }

  private setupMinimap() {
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    this.MM_H = Math.round(this.MM_W * (mapH / mapW));

    const gw = this.scale.width;
    const gh = this.scale.height;
    const zoom = Math.min(this.MM_W / mapW, this.MM_H / mapH);

    this.minimapCam = this.cameras.add(
      gw - this.MM_W - this.MM_PAD,
      gh - this.MM_H - this.MM_PAD,
      this.MM_W,
      this.MM_H,
      false,
      "minimap",
    );
    this.minimapCam.setZoom(zoom);
    this.minimapCam.centerOn(mapW / 2, mapH / 2);
    this.minimapCam.setBackgroundColor(0x08081a);
    this.minimapCam.setRoundPixels(true);

    // Viewport indicator (world-space rect, visible only on minimap)
    this.minimapViewport = this.add.graphics();
    this.minimapViewport.setDepth(99999);
    this.cameras.main.ignore(this.minimapViewport);

    // Border frame (world-space Graphics drawn around map edges, visible only on minimap)
    this.minimapBorder = this.add.graphics();
    this.minimapBorder.setDepth(99998);
    this.cameras.main.ignore(this.minimapBorder);
    const bw = 2 / zoom;
    this.minimapBorder.lineStyle(bw, 0x1e1e3a, 1);
    this.minimapBorder.strokeRect(-bw, -bw, mapW + bw * 2, mapH + bw * 2);

    // Handle window resize
    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.minimapCam.setPosition(
        gameSize.width - this.MM_W - this.MM_PAD,
        gameSize.height - this.MM_H - this.MM_PAD,
      );
    });
  }

  private updateMinimapViewport() {
    if (!this.minimapViewport || !this.minimapCam) return;
    this.minimapViewport.clear();

    const { x, y, width, height } = this.cameras.main.worldView;
    const lw = Math.ceil(2 / this.minimapCam.zoom);

    this.minimapViewport.lineStyle(lw, 0x00f2fe, 0.8);
    this.minimapViewport.strokeRect(x, y, width, height);

    // Agent position dots
    this.minimapViewport.fillStyle(0xffffff, 0.9);
    const dotR = Math.ceil(4 / this.minimapCam.zoom);
    for (const agent of this.agents) {
      this.minimapViewport.fillCircle(agent.x, agent.y, dotR);
    }
  }

  private isTileWalkable(worldX: number, worldY: number): boolean {
    if (!this.groundLayer) return true;
    const tile = this.groundLayer.getTileAtWorldXY(worldX, worldY);
    if (!tile) return false;
    return !tile.collides;
  }

  private addGroupFromTiled(
    layerName: string,
    textureKey: string,
    tilesetName: string,
    collidable: boolean,
  ): Phaser.Physics.Arcade.StaticGroup | null {
    const objectLayer = this.map.getObjectLayer(layerName);
    if (!objectLayer) return null;
    const tileset = this.map.getTileset(tilesetName);
    if (!tileset) return null;

    const group = this.physics.add.staticGroup();
    objectLayer.objects.forEach((obj) => {
      const ax = obj.x! + obj.width! * 0.5;
      const ay = obj.y! - obj.height! * 0.5;
      group.get(ax, ay, textureKey, obj.gid! - tileset.firstgid).setDepth(ay);
    });

    // SkyOffice: only collidable groups get collider with player
    // (colliders are added per-agent above, this flag is just for the return value)
    return collidable ? group : null;
  }

  private addItemGroup(
    layerName: string,
    textureKey: string,
    tilesetName: string,
  ): Phaser.Physics.Arcade.StaticGroup | null {
    const objectLayer = this.map.getObjectLayer(layerName);
    if (!objectLayer) return null;
    const tileset = this.map.getTileset(tilesetName);
    if (!tileset) return null;

    const group = this.physics.add.staticGroup();
    objectLayer.objects.forEach((obj) => {
      const ax = obj.x! + obj.width! * 0.5;
      const ay = obj.y! - obj.height! * 0.5;
      group.get(ax, ay, textureKey, obj.gid! - tileset.firstgid).setDepth(ay);
    });
    return group;
  }

  update(t: number, dt: number) {
    for (const agent of this.agents) {
      agent.update(t, dt);
    }
    this.updateMinimapViewport();
  }

  // === Public API for SolidJS ===

  getAgent(id: string): AgentSprite | undefined {
    return this.agents.find((a) => a.agentId === id);
  }

  focusAgent(id: string) {
    const agent = this.getAgent(id);
    if (agent) {
      this.cameras.main.pan(agent.x, agent.y, 500, "Power2");
    }
  }

  /** All agents go to meeting room */
  startMeeting() {
    this.agents.forEach((agent, i) => {
      const chair = this.meetingChairs[i % this.meetingChairs.length];
      agent.setMeeting(chair);
    });
    // Pan camera to meeting room center
    this.cameras.main.pan(500, 350, 800, "Power2");
  }

  /** All agents return to their desks */
  endMeetingAndWork() {
    for (const agent of this.agents) {
      agent.returnToDesk();
    }
    this.cameras.main.pan(1050, 620, 800, "Power2");
  }

  setAgentWorking(id: string) {
    this.getAgent(id)?.setWorking();
  }

  setAgentIdle(id: string) {
    this.getAgent(id)?.setIdle();
  }

  showAgentMessage(id: string, message: string) {
    this.getAgent(id)?.showStatus(message);
  }

  getAgentStates(): Record<string, string> {
    const states: Record<string, string> = {};
    for (const a of this.agents) states[a.agentId] = a.state;
    return states;
  }
}
