import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;

    const barBg = this.add.rectangle(cx, cy, 300, 20, 0x222244);
    const barFill = this.add.rectangle(cx - 148, cy, 4, 16, 0x00f2fe).setOrigin(0, 0.5);
    const loadText = this.add.text(cx, cy - 30, "LOADING OFFICE...", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#00f2fe",
    }).setOrigin(0.5);

    this.load.on("progress", (p: number) => {
      barFill.width = 296 * p;
    });

    this.load.on("complete", () => {
      barBg.destroy();
      barFill.destroy();
      loadText.destroy();
    });

    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      console.warn(`[BootScene] Failed to load: ${file.key} (${file.url})`);
    });

    // Tilemap
    this.load.tilemapTiledJSON("tilemap", "assets/map/map.json");

    // Tilesets (matching SkyOffice keys)
    this.load.spritesheet("tiles_wall", "assets/map/FloorAndGround.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("office", "assets/tileset/Modern_Office_Black_Shadow.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("generic", "assets/tileset/Generic.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("basement", "assets/tileset/Basement.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // Items
    this.load.spritesheet("chairs", "assets/items/chair.png", {
      frameWidth: 32,
      frameHeight: 64,
    });
    this.load.spritesheet("computers", "assets/items/computer.png", {
      frameWidth: 96,
      frameHeight: 64,
    });
    this.load.spritesheet("whiteboards", "assets/items/whiteboard.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("vendingmachines", "assets/items/vendingmachine.png", {
      frameWidth: 48,
      frameHeight: 72,
    });

    // Characters (32x48 per frame, SkyOffice standard)
    this.load.spritesheet("adam", "assets/character/adam.png", {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.spritesheet("ash", "assets/character/ash.png", {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.spritesheet("lucy", "assets/character/lucy.png", {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.spritesheet("nancy", "assets/character/nancy.png", {
      frameWidth: 32,
      frameHeight: 48,
    });
  }

  create() {
    this.scene.start("office");
  }
}
