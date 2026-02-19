import Phaser from "phaser";

export type AgentState = "idle" | "working" | "walking" | "sitting" | "meeting";
type Direction = "up" | "down" | "left" | "right";

export interface AgentConfig {
  id: string;
  name: string;
  texture: string;
  color: string;
}

/**
 * SkyOffice sittingShiftData: [xShift, yShift, depthShift]
 * Applied when character sits on a chair to align visually
 */
export const sittingShiftData: Record<Direction, [number, number, number]> = {
  up: [0, 3, -10],
  down: [0, 3, 1],
  left: [0, -8, 10],
  right: [0, -8, 10],
};

export interface ChairData {
  phaserX: number;
  phaserY: number;
  depth: number;
  direction: Direction;
}

export default class AgentSprite extends Phaser.Physics.Arcade.Sprite {
  agentId: string;
  agentName: string;
  agentTexture: string;
  agentColor: string;
  state: AgentState = "idle";
  direction: Direction = "down";

  deskChair: ChairData | null = null;

  private nameLabel: Phaser.GameObjects.Text;
  private statusBubble: Phaser.GameObjects.Container;
  readonly playerContainer: Phaser.GameObjects.Container;

  private walkTarget: { x: number; y: number } | null = null;
  private walkCallback: (() => void) | null = null;
  private walkSpeed = 70;
  private idleTimer = 0;
  private nextActionDelay = 0;
  private stuckTimer = 0;
  private lastPos = { x: 0, y: 0 };

  private isWalkableAt: ((wx: number, wy: number) => boolean) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, config: AgentConfig) {
    super(scene, x, y, config.texture);

    this.agentId = config.id;
    this.agentName = config.name;
    this.agentTexture = config.texture;
    this.agentColor = config.color;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(this.y);
    this.anims.play(`${this.agentTexture}_idle_down`, true);

    // Body collision size (SkyOffice pattern: 50% width, 20% height at bottom)
    const body = this.body as Phaser.Physics.Arcade.Body;
    const collisionScale = [0.5, 0.2];
    body.setSize(this.width * collisionScale[0], this.height * collisionScale[1]);
    body.setOffset(
      this.width * (1 - collisionScale[0]) * 0.5,
      this.height * (1 - collisionScale[1]),
    );

    // Player name + dialog container (SkyOffice pattern)
    this.playerContainer = scene.add.container(x, y - 30).setDepth(5000);

    scene.physics.world.enable(this.playerContainer);
    const containerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body;
    containerBody.setSize(this.width * collisionScale[0], this.height * collisionScale[1]);
    containerBody.setOffset(-8, this.height * (1 - collisionScale[1]) + 6);

    this.nameLabel = scene.add
      .text(0, 0, this.agentName, {
        fontFamily: "Arial",
        fontSize: "12px",
        color: "#000000",
      })
      .setOrigin(0.5);
    this.playerContainer.add(this.nameLabel);

    this.statusBubble = scene.add.container(0, 0).setDepth(5000);
    this.playerContainer.add(this.statusBubble);

    this.nextActionDelay = Phaser.Math.Between(4000, 10000);
    this.lastPos = { x, y };
  }

  setWalkableCheck(fn: (wx: number, wy: number) => boolean) {
    this.isWalkableAt = fn;
  }

  showStatus(text: string, duration = 4000) {
    this.statusBubble.removeAll(true);

    const innerText = this.scene.add
      .text(0, 0, text, { wordWrap: { width: 165, useAdvancedWrap: true } })
      .setFontFamily("Arial")
      .setFontSize(12)
      .setColor("#000000")
      .setOrigin(0.5);

    const th = innerText.height;
    innerText.setY(-th / 2 - this.nameLabel.height / 2);

    const boxW = innerText.width + 10;
    const boxH = th + 3;
    const boxX = innerText.x - innerText.width / 2 - 5;
    const boxY = innerText.y - th / 2 - 2;

    this.statusBubble.add(
      this.scene.add
        .graphics()
        .fillStyle(0xffffff, 1)
        .fillRoundedRect(boxX, boxY, boxW, boxH, 3)
        .lineStyle(1, 0x000000, 1)
        .strokeRoundedRect(boxX, boxY, boxW, boxH, 3),
    );
    this.statusBubble.add(innerText);

    if (duration > 0) {
      this.scene.time.delayedCall(duration, () => this.statusBubble.removeAll(true));
    }
  }

  /** Sit on a specific chair, applying SkyOffice sittingShiftData */
  sitOnChair(chair: ChairData) {
    const shift = sittingShiftData[chair.direction];
    this.setVelocity(0, 0);
    this.setPosition(chair.phaserX + shift[0], chair.phaserY + shift[1]);
    this.setDepth(chair.depth + shift[2]);

    const containerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body;
    containerBody.setVelocity(0, 0);
    this.playerContainer.setPosition(
      chair.phaserX + shift[0],
      chair.phaserY + shift[1] - 30,
    );

    this.play(`${this.agentTexture}_sit_${chair.direction}`, true);
    this.direction = chair.direction;
    this.walkTarget = null;
    this.walkCallback = null;
  }

  walkTo(worldX: number, worldY: number, onArrive?: () => void) {
    if (this.isWalkableAt && !this.isWalkableAt(worldX, worldY)) {
      onArrive?.();
      return;
    }
    this.walkTarget = { x: worldX, y: worldY };
    this.walkCallback = onArrive ?? null;
    this.state = "walking";
    this.stuckTimer = 0;
    this.lastPos = { x: this.x, y: this.y };
  }

  /** Walk to desk chair, then sit (working mode) */
  setWorking() {
    if (!this.deskChair) return;
    const chair = this.deskChair;
    this.showStatus("🚶 자리 이동...");
    this.walkTo(chair.phaserX, chair.phaserY + 10, () => {
      this.state = "working";
      this.sitOnChair(chair);
      this.showStatus("💻 작업 중...", 0);
    });
  }

  /** Walk to a meeting chair and sit */
  setMeeting(chair: ChairData) {
    this.showStatus("🚶 회의실 이동...");
    this.walkTo(chair.phaserX, chair.phaserY + 10, () => {
      this.state = "meeting";
      this.sitOnChair(chair);
      this.showStatus("🗣️ 회의 중...", 0);
    });
  }

  /** Go idle, stand up and wander */
  setIdle() {
    this.state = "idle";
    this.setVelocity(0, 0);
    const containerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body;
    containerBody.setVelocity(0, 0);

    // Restore normal depth
    this.setDepth(this.y);

    this.play(`${this.agentTexture}_idle_${this.direction}`, true);
    this.statusBubble.removeAll(true);
    this.idleTimer = 0;
    this.nextActionDelay = Phaser.Math.Between(4000, 10000);
  }

  /** Return to desk and work */
  returnToDesk() {
    this.showStatus("🚶 복귀 중...");
    this.setWorking();
  }

  /** Immediately sit on desk chair (no walking, for init) */
  sitAtDeskImmediate() {
    if (!this.deskChair) return;
    this.state = "working";
    this.sitOnChair(this.deskChair);
    this.showStatus("💻 작업 중...", 0);
  }

  private updateWalking(dt: number) {
    if (!this.walkTarget) {
      this.arriveAtTarget();
      return;
    }

    const dx = this.walkTarget.x - this.x;
    const dy = this.walkTarget.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 6) {
      this.arriveAtTarget();
      return;
    }

    // Stuck detection
    this.stuckTimer += dt;
    if (this.stuckTimer > 1500) {
      const movedDist = Phaser.Math.Distance.Between(
        this.lastPos.x, this.lastPos.y, this.x, this.y,
      );
      if (movedDist < 3) {
        this.arriveAtTarget();
        return;
      }
      this.lastPos = { x: this.x, y: this.y };
      this.stuckTimer = 0;
    }

    const vx = (dx / dist) * this.walkSpeed;
    const vy = (dy / dist) * this.walkSpeed;
    this.setVelocity(vx, vy);

    // Container follows
    const containerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body;
    containerBody.setVelocity(vx, vy);

    // Y-sort depth
    this.setDepth(this.y);

    if (Math.abs(vx) > Math.abs(vy)) {
      this.direction = vx > 0 ? "right" : "left";
    } else {
      this.direction = vy > 0 ? "down" : "up";
    }
    this.play(`${this.agentTexture}_run_${this.direction}`, true);
  }

  private arriveAtTarget() {
    this.setVelocity(0, 0);
    const containerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body;
    containerBody.setVelocity(0, 0);
    this.walkTarget = null;
    const cb = this.walkCallback;
    this.walkCallback = null;
    if (cb) {
      cb();
    } else {
      this.setIdle();
    }
  }

  private updateIdle(dt: number) {
    this.idleTimer += dt;
    if (this.idleTimer <= this.nextActionDelay) return;

    const action = Phaser.Math.Between(0, 4);
    if (action <= 1 && this.deskChair) {
      // Wander near desk
      const wx = this.deskChair.phaserX + Phaser.Math.Between(-40, 40);
      const wy = this.deskChair.phaserY + Phaser.Math.Between(-30, 30);
      if (!this.isWalkableAt || this.isWalkableAt(wx, wy)) {
        this.walkTo(wx, wy);
      } else {
        this.resetIdleTimer();
      }
    } else if (action === 2 && this.deskChair) {
      this.setWorking();
    } else {
      this.direction = (["up", "down", "left", "right"] as Direction[])[Phaser.Math.Between(0, 3)];
      this.play(`${this.agentTexture}_idle_${this.direction}`, true);
      this.resetIdleTimer();
    }
  }

  private resetIdleTimer() {
    this.idleTimer = 0;
    this.nextActionDelay = Phaser.Math.Between(3000, 6000);
  }

  update(_t: number, dt: number) {
    // Sync container position to sprite when not sitting
    if (this.state === "walking" || this.state === "idle") {
      this.playerContainer.setPosition(this.x, this.y - 30);
    }

    switch (this.state) {
      case "walking":
        this.updateWalking(dt);
        break;
      case "idle":
        this.updateIdle(dt);
        break;
      case "working":
      case "sitting":
      case "meeting":
        this.setVelocity(0, 0);
        break;
    }
  }

  destroy(fromScene?: boolean) {
    this.playerContainer?.destroy();
    super.destroy(fromScene);
  }
}
