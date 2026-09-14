import chroma from 'chroma-js';

// Exact colormap matching the high-end Copernicus / NASA ocean temperature visualization
export const THERMAL_RAMP_COLORS = [
  '#020617', // < 2°C (Deep polar trench navy)
  '#051937', // 4°C
  '#004d80', // 8°C (Deep blue)
  '#0077b6', // 12°C (Ocean blue)
  '#00b4d8', // 16°C (Cyan)
  '#00f5a0', // 20°C (Teal / Emerald)
  '#ffd600', // 24°C (Bright electric yellow)
  '#ff6d00', // 27°C (Flame orange)
  '#d50000', // 29.5°C (Crimson red)
  '#ff1744', // > 31°C (Intense thermal hot core)
];

export const THERMAL_SCALE = chroma.scale(THERMAL_RAMP_COLORS).domain([0, 32]);

/**
 * Analytical physical model of global ocean temperatures with realistic
 * equatorial warm pool, tropical Bay of Bengal / Arabian Sea heating,
 * and cold Southern Ocean / Antarctic circumpolar gradient.
 */
export function getOceanTemperature(lat, lon, dateSeed = 0) {
  // Land filtering approximation for major landmasses
  if (isLand(lat, lon)) return null;

  // Base latitudinal thermal profile (Cold poles, hot equator)
  const absLat = Math.abs(lat);
  let baseTemp = 29.5 * Math.cos(np_radians(absLat * 1.15))**1.6;

  // Northern Indian Ocean / Bay of Bengal & Arabian Sea intense heating
  if (lat >= 0 && lat <= 26 && lon >= 50 && lon <= 100) {
    const bobFactor = Math.exp(-((lat - 14.5)**2 / 45 + (lon - 86)**2 / 60));
    const asFactor = Math.exp(-((lat - 16)**2 / 45 + (lon - 65)**2 / 60));
    baseTemp += bobFactor * 3.2 + asFactor * 2.8;
  }

  // Western Pacific Warm Pool heating (Indonesia / Coral Sea)
  if (lat >= -15 && lat <= 20 && lon >= 105 && lon <= 165) {
    const wpFactor = Math.exp(-((lat - 2)**2 / 80 + (lon - 135)**2 / 120));
    baseTemp += wpFactor * 2.6;
  }

  // Cold Antarctic Circumpolar Current in the Southern Ocean
  if (lat < -40) {
    const coldPenalty = (Math.abs(lat) - 40) * 0.45;
    baseTemp = Math.max(0.5, baseTemp - coldPenalty);
  }

  // Subtle temporal & spatial eddies
  const eddy = 0.6 * Math.sin(np_radians(lon * 5 + lat * 3 + dateSeed)) +
               0.3 * Math.cos(np_radians(lon * 9 - lat * 4));

  return Math.max(0.5, Math.min(32.5, baseTemp + eddy));
}

/**
 * Ocean Current Velocity Field (u, v) in m/s.
 * Models the Antarctic Circumpolar Current, Indian Ocean Subtropical Gyre,
 * Somali Current, Agulhas Current, and Bay of Bengal Gyres.
 */
export function getOceanCurrentVelocity(lat, lon) {
  if (isLand(lat, lon)) return { u: 0, v: 0, speed: 0 };

  let u = 0;
  let v = 0;

  // 1. Antarctic Circumpolar Current (ACC) — Powerful Eastward Jet (45°S - 65°S)
  if (lat >= -65 && lat <= -40) {
    const accIntensity = Math.sin(((lat + 65) / 25) * Math.PI);
    u += accIntensity * (1.2 + 0.3 * Math.sin(np_radians(lon * 3)));
    v += 0.15 * Math.cos(np_radians(lon * 4));
  }

  // 2. South Indian Ocean Subtropical Gyre (Counter-Clockwise between 15°S and 35°S)
  if (lat >= -38 && lat <= -12 && lon >= 40 && lon <= 110) {
    const cy = -25;
    const cx = 75;
    const dx = (lon - cx) / 35;
    const dy = (lat - cy) / 13;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1 && dist < 1.4) {
      const gyreSpeed = 0.75 * Math.exp(-((dist - 0.7)**2) / 0.25);
      u += -dy * gyreSpeed;
      v += dx * gyreSpeed;
    }
  }

  // 3. Somali Current & Arabian Sea Monsoon Gyre (Clockwise)
  if (lat >= 0 && lat <= 22 && lon >= 48 && lon <= 78) {
    const cy = 12;
    const cx = 64;
    const dx = (lon - cx) / 16;
    const dy = (lat - cy) / 11;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1 && dist < 1.3) {
      const s = 0.9 * Math.exp(-((dist - 0.6)**2) / 0.2);
      u += dy * s;
      v += -dx * s;
    }
    // Coastal western boundary jet along Somali coast
    if (lon >= 48 && lon <= 58 && lat >= 2 && lat <= 14) {
      u += 0.4;
      v += 0.8;
    }
  }

  // 4. Bay of Bengal Circulation
  if (lat >= 5 && lat <= 22 && lon >= 80 && lon <= 98) {
    const cy = 14;
    const cx = 89;
    const dx = (lon - cx) / 9;
    const dy = (lat - cy) / 8.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.2) {
      const s = 0.6 * Math.exp(-((dist - 0.5)**2) / 0.18);
      u += dy * s;
      v += -dx * s;
    }
  }

  // 5. Equatorial Current System
  if (lat >= -8 && lat <= 6 && lon >= 40 && lon <= 120) {
    u += -0.55 * Math.cos((lat / 7) * (Math.PI / 2));
  }

  // 6. Agulhas Current (Fast southward jet off SE Africa)
  if (lat >= -38 && lat <= -24 && lon >= 28 && lon <= 42) {
    v -= 1.1;
    u -= 0.3;
  }

  // Turbulent meso-scale eddies
  const turbulence = 0.08 * Math.sin(np_radians(lon * 8 + lat * 6));
  u += turbulence;
  v += 0.08 * Math.cos(np_radians(lon * 6 - lat * 8));

  const speed = Math.sqrt(u * u + v * v);
  return { u, v, speed };
}

function np_radians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Fast raster land bounding box check to keep land clean and oceans glowing.
 */
function isLand(lat, lon) {
  // India / South Asia
  if (lat >= 8.0 && lat <= 36.0 && lon >= 68.0 && lon <= 89.0) {
    if (lat < 22.0 && lon > 72.0 && lon < 85.5) {
      // Indian Peninsula triangle
      const progress = (lat - 8.0) / 14.0;
      const wLon = 77.5 - progress * 5.5;
      const eLon = 77.5 + progress * 8.0;
      if (lon >= wLon && lon <= eLon) return true;
    } else if (lat >= 20.0) {
      return true;
    }
  }
  // Africa
  if (lat >= -35 && lat <= 37 && lon >= -18 && lon <= 51) {
    if (lon > 40 && lat < -10) { /* Madagascar separate */ }
    else if (lon < 50 && lat < 12) return true;
    else if (lat >= 12 && lon <= 43) return true;
  }
  // Arabian Peninsula
  if (lat >= 12 && lat <= 32 && lon >= 35 && lon <= 60) return true;
  // Australia
  if (lat >= -39 && lat <= -11 && lon >= 113 && lon <= 154) return true;
  // Antarctica
  if (lat < -68) return true;
  // Southeast Asia / China
  if (lat >= 10 && lat <= 55 && lon >= 99 && lon <= 130) {
    if (lat >= 20 || (lon >= 99 && lon <= 109)) return true;
  }
  return false;
}

/**
 * Generates an ultra-high quality seamless global/regional thermal canvas texture.
 */
export function generateGlobalThermalTexture(width = 1024, height = 512, bbox = null) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const minLat = bbox ? bbox.south : -80;
  const maxLat = bbox ? bbox.north : 80;
  const minLon = bbox ? bbox.west : -180;
  const maxLon = bbox ? bbox.east : 180;

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Pre-calculate Look-Up Table for speed
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const tempVal = (i / 255) * 32.0;
    const rgb = THERMAL_SCALE(tempVal).rgb();
    lut[i * 4] = rgb[0];
    lut[i * 4 + 1] = rgb[1];
    lut[i * 4 + 2] = rgb[2];
    lut[i * 4 + 3] = 230; // High opacity thermal glow
  }

  for (let py = 0; py < height; py++) {
    const lat = maxLat - (py / height) * latSpan;
    const rowOffset = py * width * 4;

    for (let px = 0; px < width; px++) {
      const lon = minLon + (px / width) * lonSpan;
      const temp = getOceanTemperature(lat, lon);

      const idx = rowOffset + px * 4;
      if (temp === null) {
        // Land pixel: transparent so satellite imagery shows through
        data[idx + 3] = 0;
      } else {
        const lutIdx = Math.max(0, Math.min(255, Math.floor((temp / 32.0) * 255)));
        data[idx] = lut[lutIdx * 4];
        data[idx + 1] = lut[lutIdx * 4 + 1];
        data[idx + 2] = lut[lutIdx * 4 + 2];
        data[idx + 3] = 225; // Rich thermal field
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return {
    canvas,
    bounds: { south: minLat, north: maxLat, west: minLon, east: maxLon }
  };
}
