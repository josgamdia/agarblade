import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

export function createPhaserGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#040408',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
      powerPreference: 'high-performance',
      roundPixels: true,
    },
    input: {
      keyboard: false, // input.js handles keyboard via window events
    },
  });
}
