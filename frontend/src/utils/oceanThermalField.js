import chroma from 'chroma-js';

// ═══════════════════════════════════════════════════════════════════════
// Colormaps — scientifically accurate palettes for each ocean variable
// ═══════════════════════════════════════════════════════════════════════
export const PALETTE_SCALES = {
  coolwarm: chroma.scale(['#020617', '#1e3a8a', '#0284c7', '#00d4ff', '#ffffff', '#fbbf24', '#f97316', '#dc2626']).domain([0, 32]),
  viridis:  chroma.scale(['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']).domain([31, 37.5]),
  turbo:    chroma.scale(['#30123b', '#1ae4b6', '#a2fc3c', '#fb8022', '#7a0403']).domain([0, 2.5]),
  emerald:  chroma.scale(['#051508', '#166534', '#22c55e', '#86efac', '#fef08a']).domain([0.01, 3.5]),
  hypoxia:  chroma.scale(['#dc2626', '#f59e0b', '#22d3ee', '#0284c7', '#1e3a8a']).domain([20, 260]),
  plasma:   chroma.scale(['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636']).domain([7.6, 8.25]),
};

export const THERMAL_SCALE = PALETTE_SCALES.coolwarm;

// Variable → palette mapping
const VARIABLE_PALETTE_MAP = {
  temperature: 'coolwarm',
  salinity: 'viridis',
  currents: 'turbo',
  chlorophyll: 'emerald',
  oxygen: 'hypoxia',
  ph: 'plasma',
};

function np_radians(deg) {
  return (deg * Math.PI) / 180;
}

// ═══════════════════════════════════════════════════════════════════════
// Analytical Ocean Model — Global Multidimensional Ocean Physics & BGC
// ═══════════════════════════════════════════════════════════════════════

/**
 * Computes ocean variable value at any global (lat, lon, depth) coordinate.
 * High-fidelity representation of global oceans with specialized INCOIS Indian Ocean dynamics.
 */
export function getOceanVariableValue(lat, lon, variable = 'temperature', depth = 0) {
  const absLat = Math.abs(lat);
  const depthFactor = Math.exp(-depth / 380);

  // 1. TEMPERATURE (°C)
  if (variable === 'temperature') {
    // Latitudinal solar insolation profile
    let sst = 29.0 * Math.pow(Math.max(0, Math.cos(np_radians(absLat * 1.05))), 1.35);

    // Indo-Pacific Warm Pool (warmest ocean water on Earth)
    if (lat >= -15 && lat <= 25 && lon >= 50 && lon <= 160) {
      const warmPool = Math.exp(-((lat - 5)**2 / 180 + (lon - 95)**2 / 800));
      sst += warmPool * 2.8;
    }

    // Northern Indian Ocean regional dynamics (Arabian Sea & Bay of Bengal)
    if (lat >= 0 && lat <= 26 && lon >= 50 && lon <= 100) {
      // Bay of Bengal Warm Pool
      const bobWarmth = Math.exp(-((lat - 15)**2 / 45 + (lon - 88)**2 / 55));
      sst += bobWarmth * 1.8;

      // Somali & Oman coastal upwelling cooling during monsoon
      const upwellingSomali = Math.exp(-((lat - 10)**2 / 25 + (lon - 54)**2 / 20));
      const upwellingOman = Math.exp(-((lat - 19)**2 / 20 + (lon - 59)**2 / 20));
      sst -= (upwellingSomali * 2.5 + upwellingOman * 2.0);
    }

    // Gulf Stream & Kuroshio warm western boundary currents
    if (lat >= 25 && lat <= 45 && lon >= -80 && lon <= -45) {
      sst += 2.2 * Math.exp(-((lat - 35)**2 / 60 + (lon - 65)**2 / 120));
    }
    if (lat >= 20 && lat <= 42 && lon >= 120 && lon <= 150) {
      sst += 2.0 * Math.exp(-((lat - 30)**2 / 60 + (lon - 135)**2 / 100));
    }

    // Polar cooling (Southern Ocean & Arctic)
    if (absLat > 50) {
      sst = Math.max(-1.5, sst - (absLat - 50) * 0.42);
    }

    // Vertical stratification: thermocline decay towards abyssal 2.0°C
    const val = (sst * depthFactor) + (1 - depthFactor) * 2.0;
    return Math.max(-1.8, Math.min(33.0, val));
  }

  // 2. SALINITY (PSU)
  if (variable === 'salinity') {
    // Base global salinity profile: high in subtropics (~35.6), lower at equator (~34.5) and poles (~33.0)
    let sal = 34.7 + 1.2 * Math.sin(np_radians(absLat * 2.2 - 20));

    // Arabian Sea: extremely high evaporation -> 36.2 to 36.9 PSU
    if (lat >= 5 && lat <= 26 && lon >= 52 && lon <= 77) {
      const arabianSeaFactor = Math.exp(-((lat - 17)**2 / 60 + (lon - 65)**2 / 70));
      sal += arabianSeaFactor * 1.8;
    }

    // Red Sea & Persian Gulf: hypersaline (>38 PSU)
    if (lat >= 12 && lat <= 30 && lon >= 38 && lon <= 56) {
      sal += 2.5;
    }

    // Bay of Bengal: massive freshwater river discharge (Ganges, Brahmaputra, Irrawaddy) -> 31.5 to 33.2 PSU
    if (lat >= 5 && lat <= 24 && lon >= 80 && lon <= 96) {
      const bobFreshening = Math.exp(-((lat - 18)**2 / 40 + (lon - 89)**2 / 45));
      sal -= bobFreshening * 2.6;
    }

    // Deep ocean converges to uniform ~34.7 PSU
    return (sal * depthFactor) + (1 - depthFactor) * 34.7;
  }

  // 3. CHLOROPHYLL-a (mg/m³)
  if (variable === 'chlorophyll') {
    let chl = 0.08; // Oligotrophic open ocean baseline

    // Indian Ocean coastal upwelling & river plumes
    if (lat >= 5 && lat <= 24 && lon >= 50 && lon <= 98) {
      // Northern Bay of Bengal river discharge bloom
      const bobBloom = Math.exp(-((lat - 20)**2 / 20 + (lon - 89)**2 / 30));
      // Southwest Monsoon upwelling along western Indian coast & Somalia
      const wiccBloom = Math.exp(-((lat - 13)**2 / 35 + (lon - 73)**2 / 15));
      const somaliBloom = Math.exp(-((lat - 11)**2 / 25 + (lon - 53)**2 / 15));
      chl += bobBloom * 2.2 + wiccBloom * 1.5 + somaliBloom * 2.0;
    }

    // Subpolar high-latitude blooms
    if (absLat >= 45 && absLat <= 65) {
      chl += 0.8 * Math.sin(np_radians((absLat - 45) * 9));
    }

    // Equatorial divergence zone
    if (absLat <= 5) {
      chl += 0.35;
    }

    // Euphotic zone attenuation: chlorophyll is produced only in sunlit top 120m
    const euphoticFactor = Math.exp(-depth / 80);
    return Math.max(0.01, Math.min(4.5, chl * euphoticFactor));
  }

  // 4. DISSOLVED OXYGEN (mmol/m³)
  if (variable === 'oxygen') {
    // Cold surface waters hold more dissolved gas
    let oxy = 220.0 + (absLat / 90) * 80;

    // Severe Oxygen Minimum Zone (OMZ) in intermediate depths of Arabian Sea & Bay of Bengal (150 - 800m)
    if (lat >= 6 && lat <= 24 && lon >= 54 && lon <= 95) {
      if (depth >= 80 && depth <= 850) {
        const omzIntensity = Math.exp(-((depth - 350)**2) / 45000);
        oxy -= omzIntensity * 185; // Drops to hypoxic 25-45 mmol/m³
      }
    } else if (depth >= 150 && depth <= 700) {
      // General oceanic OMZ
      oxy -= 70 * Math.exp(-((depth - 400)**2) / 50000);
    }

    return Math.max(15, Math.min(320, oxy));
  }

  // 5. CURRENTS SPEED (m/s)
  if (variable === 'currents') {
    const vel = getOceanCurrentVelocity(lat, lon);
    return vel.speed * depthFactor;
  }

  // 6. pH
  if (variable === 'ph') {
    let basePh = 8.14;
    // Upwelling & OMZ zones have lower pH (acidification)
    if (lat >= 5 && lat <= 24 && lon >= 54 && lon <= 95 && depth > 50) {
      basePh -= 0.28 * Math.exp(-((depth - 300)**2) / 60000);
    }
    return Math.max(7.60, Math.min(8.25, basePh - (depth / 4000) * 0.15));
  }

  return 26.0;
}

export function getOceanTemperature(lat, lon, dateSeed = 0) {
  return getOceanVariableValue(lat, lon, 'temperature', 0);
}

/**
 * Ocean Current Velocity Field (u, v) in m/s.
 */
export function getOceanCurrentVelocity(lat, lon) {
  let u = 0;
  let v = 0;

  // 1. Antarctic Circumpolar Current (ACC) - massive eastward flow
  if (lat >= -65 && lat <= -40) {
    const accIntensity = Math.sin(((lat + 65) / 25) * Math.PI);
    u += accIntensity * (1.3 + 0.3 * Math.sin(np_radians(lon * 3)));
    v += 0.12 * Math.cos(np_radians(lon * 4));
  }

  // 2. Somali Current (strong northward western boundary jet)
  if (lat >= -2 && lat <= 16 && lon >= 48 && lon <= 58) {
    const somali = Math.exp(-((lat - 8)**2 / 40 + (lon - 52)**2 / 16));
    v += somali * 1.8;
    u += somali * 0.5;
  }

  // 3. Arabian Sea Monsoon Gyre (clockwise in summer)
  if (lat >= 8 && lat <= 22 && lon >= 56 && lon <= 75) {
    const cy = 15;
    const cx = 65;
    const dx = (lon - cx) / 10;
    const dy = (lat - cy) / 7;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.3) {
      const s = 0.85 * Math.exp(-((dist - 0.6)**2) / 0.2);
      u += dy * s;
      v += -dx * s;
    }
  }

  // 4. Bay of Bengal Circulation
  if (lat >= 5 && lat <= 22 && lon >= 80 && lon <= 96) {
    const cy = 14;
    const cx = 88;
    const dx = (lon - cx) / 8;
    const dy = (lat - cy) / 8;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.3) {
      const s = 0.7 * Math.exp(-((dist - 0.5)**2) / 0.18);
      u += dy * s;
      v += -dx * s;
    }
  }

  // 5. Equatorial Jet (Wyrtki Jets in Indian Ocean)
  if (lat >= -5 && lat <= 5 && lon >= 50 && lon <= 100) {
    u += 0.75 * Math.cos((lat / 5) * (Math.PI / 2));
  }

  // 6. Agulhas Current (intense southward flow along southeast Africa)
  if (lat >= -38 && lat <= -25 && lon >= 28 && lon <= 40) {
    v -= 1.4 * Math.exp(-((lat + 31)**2 / 30 + (lon - 34)**2 / 15));
    u -= 0.3;
  }

  // Background gentle eddy circulation
  u += 0.08 * Math.sin(np_radians(lat * 3 + lon * 2));
  v += 0.08 * Math.cos(np_radians(lat * 2 - lon * 3));

  const speed = Math.sqrt(u * u + v * v);
  return { u, v, speed };
}

// ═══════════════════════════════════════════════════════════════════════
// Bilinear interpolation for smooth texture upscaling
// ═══════════════════════════════════════════════════════════════════════

function bilinearSample(grid, w, h, fx, fy) {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);

  const sx = fx - x0;
  const sy = fy - y0;

  const v00 = grid[y0 * w + x0];
  const v10 = grid[y0 * w + x1];
  const v01 = grid[y1 * w + x0];
  const v11 = grid[y1 * w + x1];

  const top = v00 * (1 - sx) + v10 * sx;
  const bot = v01 * (1 - sx) + v11 * sx;
  return top * (1 - sy) + bot * sy;
}

// ═══════════════════════════════════════════════════════════════════════
// Separable Gaussian Blur for silky anti-aliased heatmap gradients
// ═══════════════════════════════════════════════════════════════════════

function gaussianBlurRGBA(data, width, height, sigma = 2.0) {
  if (sigma <= 0) return;
  const radius = Math.ceil(sigma * 2.2);
  const kernelSize = radius * 2 + 1;

  const kernel = new Float32Array(kernelSize);
  let sum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) kernel[i] /= sum;

  const temp = new Uint8ClampedArray(data.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(Math.max(x + k, 0), width - 1);
        const idx = rowOffset + sx * 4;
        const w = kernel[k + radius];
        r += data[idx] * w;
        g += data[idx + 1] * w;
        b += data[idx + 2] * w;
        a += data[idx + 3] * w;
      }
      const outIdx = rowOffset + x * 4;
      temp[outIdx] = r;
      temp[outIdx + 1] = g;
      temp[outIdx + 2] = b;
      temp[outIdx + 3] = a;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(Math.max(y + k, 0), height - 1);
        const idx = (sy * width + x) * 4;
        const w = kernel[k + radius];
        r += temp[idx] * w;
        g += temp[idx + 1] * w;
        b += temp[idx + 2] * w;
        a += temp[idx + 3] * w;
      }
      const outIdx = (y * width + x) * 4;
      data[outIdx] = r;
      data[outIdx + 1] = g;
      data[outIdx + 2] = b;
      data[outIdx + 3] = a;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN: Generate Smooth Global Thermal/Scalar Texture
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a smooth, vibrant, scientifically colorized texture for Globe.gl sphere overlay.
 * Coordinates are mapped exactly to full equirectangular projection:
 * Lat: +90 (North Pole, top) to -90 (South Pole, bottom)
 * Lon: -180 (left) to +180 (right)
 */
export function generateGlobalThermalTexture(
  width = 1024,
  height = 512,
  variable = 'temperature',
  depth = 0,
  paletteKey = 'coolwarm'
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Full sphere projection
  const minLat = -90;
  const maxLat = 90;
  const minLon = -180;
  const maxLon = 180;

  // Step 1: Sample on coarse grid for high performance
  const coarseW = 180;
  const coarseH = 90;
  const coarseGrid = new Float32Array(coarseW * coarseH);

  for (let cy = 0; cy < coarseH; cy++) {
    const lat = maxLat - (cy / (coarseH - 1)) * 180;
    for (let cx = 0; cx < coarseW; cx++) {
      const lon = minLon + (cx / (coarseW - 1)) * 360;
      coarseGrid[cy * coarseW + cx] = getOceanVariableValue(lat, lon, variable, depth);
    }
  }

  // Step 2: Build 512-step color LUT
  const effectivePalette = VARIABLE_PALETTE_MAP[variable] || paletteKey;
  const scale = PALETTE_SCALES[effectivePalette] || PALETTE_SCALES.coolwarm;
  const [minDomain, maxDomain] = scale.domain();
  const domainSpan = maxDomain - minDomain || 1;

  const lutSize = 512;
  const lut = new Uint8Array(lutSize * 3);
  for (let i = 0; i < lutSize; i++) {
    const val = minDomain + (i / (lutSize - 1)) * domainSpan;
    const rgb = scale(val).rgb();
    lut[i * 3] = rgb[0];
    lut[i * 3 + 1] = rgb[1];
    lut[i * 3 + 2] = rgb[2];
  }

  // Step 3: Bilinear interpolation to full resolution
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let py = 0; py < height; py++) {
    const fy = (py / (height - 1)) * (coarseH - 1);
    const rowOffset = py * width * 4;

    for (let px = 0; px < width; px++) {
      const fx = (px / (width - 1)) * (coarseW - 1);
      const val = bilinearSample(coarseGrid, coarseW, coarseH, fx, fy);

      const norm = Math.max(0, Math.min(1, (val - minDomain) / domainSpan));
      const lutIdx = Math.floor(norm * (lutSize - 1));
      const idx = rowOffset + px * 4;

      data[idx] = lut[lutIdx * 3];
      data[idx + 1] = lut[lutIdx * 3 + 1];
      data[idx + 2] = lut[lutIdx * 3 + 2];
      data[idx + 3] = 230; // Consistent, rich alpha for Three.js material blending
    }
  }

  // Step 4: Gaussian blur for smooth visual transitions
  gaussianBlurRGBA(data, width, height, 2.0);

  ctx.putImageData(imgData, 0, 0);

  return {
    canvas,
    dataUrl: canvas.toDataURL(),
    bounds: { south: minLat, north: maxLat, west: minLon, east: maxLon },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Real Backend Grid Data Integration (Inverse Distance Weighting)
// ═══════════════════════════════════════════════════════════════════════

const BACKEND_FIELD_MAP = {
  temperature: 'temperature_c',
  salinity: 'salinity_psu',
  chlorophyll: 'chlorophyll_mgl',
  oxygen: 'oxygen_mmolm3',
  currents: 'current_speed',
  ph: 'ph',
};

function idwInterpolate(points, targetLat, targetLon, power = 2, searchRadius = 6, maxNeighbors = 8) {
  let candidates = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.value === null || p.value === undefined || isNaN(p.value)) continue;

    const dlat = p.lat - targetLat;
    const dlon = p.lon - targetLon;
    const dist = Math.sqrt(dlat * dlat + dlon * dlon);

    if (dist < 0.01) return p.value;
    if (dist <= searchRadius) {
      candidates.push({ value: p.value, dist });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.dist - b.dist);
  if (candidates.length > maxNeighbors) candidates = candidates.slice(0, maxNeighbors);

  let weightSum = 0;
  let valueSum = 0;

  for (const c of candidates) {
    const w = 1 / Math.pow(c.dist, power);
    weightSum += w;
    valueSum += c.value * w;
  }

  return weightSum > 0 ? valueSum / weightSum : null;
}

export function generateTextureFromGridData(
  width = 1024,
  height = 512,
  gridData = [],
  variable = 'temperature',
  depth = 0,
  paletteKey = 'coolwarm'
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const minLat = -90;
  const maxLat = 90;
  const minLon = -180;
  const maxLon = 180;

  const fieldKey = BACKEND_FIELD_MAP[variable] || 'temperature_c';
  const dataPoints = gridData
    .filter((pt) => pt[fieldKey] !== null && pt[fieldKey] !== undefined)
    .map((pt) => ({
      lat: pt.lat,
      lon: pt.lon,
      value: pt[fieldKey],
    }));

  const dataBbox = dataPoints.length > 0 ? {
    south: Math.min(...dataPoints.map(p => p.lat)) - 3,
    north: Math.max(...dataPoints.map(p => p.lat)) + 3,
    west: Math.min(...dataPoints.map(p => p.lon)) - 3,
    east: Math.max(...dataPoints.map(p => p.lon)) + 3,
  } : null;

  const coarseW = 180;
  const coarseH = 90;
  const coarseGrid = new Float32Array(coarseW * coarseH);

  for (let cy = 0; cy < coarseH; cy++) {
    const lat = maxLat - (cy / (coarseH - 1)) * 180;
    for (let cx = 0; cx < coarseW; cx++) {
      const lon = minLon + (cx / (coarseW - 1)) * 360;
      const cIdx = cy * coarseW + cx;

      let val = null;
      if (dataBbox && dataPoints.length > 0 &&
          lat >= dataBbox.south && lat <= dataBbox.north &&
          lon >= dataBbox.west && lon <= dataBbox.east) {
        val = idwInterpolate(dataPoints, lat, lon, 2, 5, 6);
      }

      if (val === null) {
        val = getOceanVariableValue(lat, lon, variable, depth);
      }

      coarseGrid[cIdx] = val;
    }
  }

  const effectivePalette = VARIABLE_PALETTE_MAP[variable] || paletteKey;
  const scale = PALETTE_SCALES[effectivePalette] || PALETTE_SCALES.coolwarm;
  const [minDomain, maxDomain] = scale.domain();
  const domainSpan = maxDomain - minDomain || 1;

  const lutSize = 512;
  const lut = new Uint8Array(lutSize * 3);
  for (let i = 0; i < lutSize; i++) {
    const val = minDomain + (i / (lutSize - 1)) * domainSpan;
    const rgb = scale(val).rgb();
    lut[i * 3] = rgb[0];
    lut[i * 3 + 1] = rgb[1];
    lut[i * 3 + 2] = rgb[2];
  }

  const imgData = ctx.createImageData(width, height);
  const pixels = imgData.data;

  for (let py = 0; py < height; py++) {
    const fy = (py / (height - 1)) * (coarseH - 1);
    const rowOffset = py * width * 4;
    for (let px = 0; px < width; px++) {
      const fx = (px / (width - 1)) * (coarseW - 1);
      const val = bilinearSample(coarseGrid, coarseW, coarseH, fx, fy);
      const norm = Math.max(0, Math.min(1, (val - minDomain) / domainSpan));
      const lutIdx = Math.floor(norm * (lutSize - 1));
      const idx = rowOffset + px * 4;

      pixels[idx] = lut[lutIdx * 3];
      pixels[idx + 1] = lut[lutIdx * 3 + 1];
      pixels[idx + 2] = lut[lutIdx * 3 + 2];
      pixels[idx + 3] = 230;
    }
  }

  gaussianBlurRGBA(pixels, width, height, 2.0);

  ctx.putImageData(imgData, 0, 0);

  return {
    canvas,
    dataUrl: canvas.toDataURL(),
    bounds: { south: minLat, north: maxLat, west: minLon, east: maxLon },
  };
}
