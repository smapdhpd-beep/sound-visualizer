/**
 * Global Color Themes
 * 4 套全局配色，不绑定模式
 */

export const COLOR_THEMES = {
  warmSand: {
    name: '暖沙',
    bg: [32, 18, 12],
    particle: [255, 228, 190],
    accent: [255, 160, 60],
    glow: [255, 200, 130],
    trailAlpha: 0.18,
    blend: 'lighter',
  },
  neon: {
    name: '霓虹',
    bg: [8, 6, 18],
    particle: [180, 120, 255],
    accent: [0, 255, 220],
    glow: [255, 0, 128],
    trailAlpha: 0.1,
    blend: 'lighter',
  },
  ink: {
    name: '水墨',
    bg: [10, 14, 16],
    particle: [170, 180, 185],
    accent: [100, 115, 125],
    glow: [140, 150, 160],
    trailAlpha: 0.04,
    blend: 'source-over',
  },
  aurora: {
    name: '极光',
    bg: [5, 10, 18],
    particle: [100, 255, 200],
    accent: [0, 150, 255],
    glow: [200, 100, 255],
    trailAlpha: 0.12,
    blend: 'lighter',
  },
};
