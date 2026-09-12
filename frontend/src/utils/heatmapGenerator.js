import chroma from 'chroma-js';
import { COLOR_PALETTES } from './colorRamp';

/**
 * Generate an ultra-smooth raster heatmap canvas from sparse or dense geo-points.
 * Uses Gaussian radial splatting + palette color mapping.
 */
export function generateHeatmapCanvas({
  points,
  colorMin = 26.0,
  colorMax = 31.0,
  paletteKey = 'ocean',
  radius = 32,
  blur = 18,
  width = 512,
  height = 512,
}) {
  if (!points || points.length === 0) return null;

  // 1. Calculate Geographic Bounding Box
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.value == null || isNaN(p.value)) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  if (minLat >= maxLat || minLon >= maxLon) {
    minLat -= 2; maxLat += 2;
    minLon -= 2; maxLon += 2;
  }

  // Add small margin around bounds
  const latMargin = (maxLat - minLat) * 0.08 || 1.0;
  const lonMargin = (maxLon - minLon) * 0.08 || 1.0;
  const south = Math.max(-85, minLat - latMargin);
  const north = Math.min(85, maxLat + latMargin);
  const west = Math.max(-180, minLon - lonMargin);
  const east = Math.min(180, maxLon + lonMargin);

  const latSpan = north - south;
  const lonSpan = east - west;

  // 2. Offscreen Intensity Canvas (grayscale alpha accumulator)
  const intensityCanvas = document.createElement('canvas');
  intensityCanvas.width = width;
  intensityCanvas.height = height;
  const ictx = intensityCanvas.getContext('2d', { willReadFrequently: true });

  ictx.fillStyle = 'rgba(0,0,0,0)';
  ictx.fillRect(0, 0, width, height);

  // 3. Create radial splat brush
  const brushCanvas = document.createElement('canvas');
  const brushSize = radius * 2;
  brushCanvas.width = brushSize;
  brushCanvas.height = brushSize;
  const bctx = brushCanvas.getContext('2d');

  const grad = bctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(Math.max(0.1, 1 - blur / radius), 'rgba(0,0,0,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, brushSize, brushSize);

  // 4. Draw points into intensity canvas
  const valRange = colorMax - colorMin || 1.0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.value == null || isNaN(p.value)) continue;

    const norm = Math.max(0.1, Math.min(1.0, (p.value - colorMin) / valRange));
    const x = ((p.lon - west) / lonSpan) * width;
    const y = ((north - p.lat) / latSpan) * height;

    ictx.globalAlpha = norm * 0.85;
    ictx.drawImage(brushCanvas, x - radius, y - radius);
  }

  // 5. Offscreen Colorized Output Canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const octx = outCanvas.getContext('2d', { willReadFrequently: true });

  const imgData = ictx.getImageData(0, 0, width, height);
  const pixels = imgData.data;
  const outImgData = octx.createImageData(width, height);
  const outPixels = outImgData.data;

  // Color ramp lookup table (256 entries)
  const palette = COLOR_PALETTES[paletteKey] || COLOR_PALETTES.ocean;
  const rampScale = chroma.scale(palette).domain([0, 255]);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const rgb = rampScale(i).rgb();
    lut[i * 4] = rgb[0];
    lut[i * 4 + 1] = rgb[1];
    lut[i * 4 + 2] = rgb[2];
    lut[i * 4 + 3] = i < 8 ? 0 : Math.min(240, Math.floor(i * 0.92));
  }

  // Re-color pixels based on accumulated intensity alpha
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha > 5) {
      outPixels[i] = lut[alpha * 4];
      outPixels[i + 1] = lut[alpha * 4 + 1];
      outPixels[i + 2] = lut[alpha * 4 + 2];
      outPixels[i + 3] = lut[alpha * 4 + 3];
    }
  }

  octx.putImageData(outImgData, 0, 0);

  return {
    canvas: outCanvas,
    bounds: { south, north, west, east },
  };
}
