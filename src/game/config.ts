import Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import OfficeScene from "./scenes/OfficeScene";

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: Math.max(parent.clientWidth, 320),
    height: Math.max(parent.clientHeight, 240),
    pixelArt: true,
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, OfficeScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: "#05050a",
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true,
    },
  };
}
