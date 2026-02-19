import Phaser from "phaser";

const CHARACTERS = ["adam", "ash", "lucy", "nancy"] as const;
const ANIM_FRAME_RATE = 15;

export function createCharacterAnims(anims: Phaser.Animations.AnimationManager) {
  for (const name of CHARACTERS) {
    const idle = ANIM_FRAME_RATE * 0.6;

    // idle: 6 frames each direction
    anims.create({ key: `${name}_idle_right`, frames: anims.generateFrameNumbers(name, { start: 0, end: 5 }), repeat: -1, frameRate: idle });
    anims.create({ key: `${name}_idle_up`, frames: anims.generateFrameNumbers(name, { start: 6, end: 11 }), repeat: -1, frameRate: idle });
    anims.create({ key: `${name}_idle_left`, frames: anims.generateFrameNumbers(name, { start: 12, end: 17 }), repeat: -1, frameRate: idle });
    anims.create({ key: `${name}_idle_down`, frames: anims.generateFrameNumbers(name, { start: 18, end: 23 }), repeat: -1, frameRate: idle });

    // run: 6 frames each direction
    anims.create({ key: `${name}_run_right`, frames: anims.generateFrameNumbers(name, { start: 24, end: 29 }), repeat: -1, frameRate: ANIM_FRAME_RATE });
    anims.create({ key: `${name}_run_up`, frames: anims.generateFrameNumbers(name, { start: 30, end: 35 }), repeat: -1, frameRate: ANIM_FRAME_RATE });
    anims.create({ key: `${name}_run_left`, frames: anims.generateFrameNumbers(name, { start: 36, end: 41 }), repeat: -1, frameRate: ANIM_FRAME_RATE });
    anims.create({ key: `${name}_run_down`, frames: anims.generateFrameNumbers(name, { start: 42, end: 47 }), repeat: -1, frameRate: ANIM_FRAME_RATE });

    // sit: single frame each direction
    anims.create({ key: `${name}_sit_down`, frames: anims.generateFrameNumbers(name, { start: 48, end: 48 }), repeat: 0, frameRate: ANIM_FRAME_RATE });
    anims.create({ key: `${name}_sit_left`, frames: anims.generateFrameNumbers(name, { start: 49, end: 49 }), repeat: 0, frameRate: ANIM_FRAME_RATE });
    anims.create({ key: `${name}_sit_right`, frames: anims.generateFrameNumbers(name, { start: 50, end: 50 }), repeat: 0, frameRate: ANIM_FRAME_RATE });
    anims.create({ key: `${name}_sit_up`, frames: anims.generateFrameNumbers(name, { start: 51, end: 51 }), repeat: 0, frameRate: ANIM_FRAME_RATE });
  }
}
