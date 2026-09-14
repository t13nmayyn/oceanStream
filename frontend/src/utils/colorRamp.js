import chroma from 'chroma-js';

export const COLOR_PALETTES = {
  ocean: ['#0077b6', '#00b4d8', '#90e0ef', '#ffd166', '#f54375'],
  plasma: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
  turbo: ['#30123b', '#4145ab', '#2879e2', '#18b1b5', '#4cc86c', '#a4d825', '#f3c726', '#f4701a', '#c22303'],
  coolwarm: ['#3b4cc0', '#8cb2e9', '#f2f2f2', '#f49a7b', '#b40426'],
  viridis: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
};

export const COLOR_RAMP = chroma
  .scale(COLOR_PALETTES.ocean)
  .domain([0, 1]);

export function getColorForValue(value, min, max, paletteKey = 'ocean') {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const palette = COLOR_PALETTES[paletteKey] || COLOR_PALETTES.ocean;
  return chroma.scale(palette).domain([0, 1])(norm).hex();
}

export function getColorRGBA(value, min, max, alpha = 210, paletteKey = 'ocean') {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const palette = COLOR_PALETTES[paletteKey] || COLOR_PALETTES.ocean;
  const rgb = chroma(chroma.scale(palette).domain([0, 1])(norm).hex()).rgb();
  return [rgb[0], rgb[1], rgb[2], alpha];
}
