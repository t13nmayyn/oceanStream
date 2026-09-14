import { getOceanCurrentVelocity } from './oceanThermalField';

/**
 * Ocean Flow Streamline Particle Animation Engine.
 * Simulates thousands of luminous particles advected by global ocean currents,
 * drawing glowing swirling gyres and jets across the globe.
 */
export class StreamlineEngine {
  constructor({
    width = 1024,
    height = 512,
    numParticles = 3200,
    speedFactor = 1.6,
    fadeRate = 0.94,
    bounds = { south: -80, north: 80, west: -180, east: 180 },
  } = {}) {
    this.width = width;
    this.height = height;
    this.numParticles = numParticles;
    this.speedFactor = speedFactor;
    this.fadeRate = fadeRate;
    this.bounds = bounds;

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');

    this.particles = [];
    this.initParticles();
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.numParticles; i++) {
      this.particles.push(this.createParticle());
    }
  }

  createParticle() {
    // Distribute particles with higher density in high-energy current zones (ACC & Indian Ocean)
    let lat, lon;
    if (Math.random() < 0.45) {
      // Southern Ocean ACC zone
      lat = -65 + Math.random() * 30;
      lon = this.bounds.west + Math.random() * (this.bounds.east - this.bounds.west);
    } else if (Math.random() < 0.8) {
      // Indian Ocean & Arabian Sea / Bay of Bengal
      lat = -35 + Math.random() * 60;
      lon = 40 + Math.random() * 80;
    } else {
      lat = this.bounds.south + Math.random() * (this.bounds.north - this.bounds.south);
      lon = this.bounds.west + Math.random() * (this.bounds.east - this.bounds.west);
    }

    return {
      lat,
      lon,
      prevLat: lat,
      prevLon: lon,
      age: Math.floor(Math.random() * 80),
      maxAge: 60 + Math.floor(Math.random() * 90),
      lineWidth: 0.8 + Math.random() * 1.4,
    };
  }

  step() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const latSpan = this.bounds.north - this.bounds.south;
    const lonSpan = this.bounds.east - this.bounds.west;

    // Smooth temporal trail fade
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    const dt = 0.08 * this.speedFactor;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age++;

      if (p.age > p.maxAge || p.lat < this.bounds.south || p.lat > this.bounds.north || p.lon < this.bounds.west || p.lon > this.bounds.east) {
        this.particles[i] = this.createParticle();
        continue;
      }

      const vel = getOceanCurrentVelocity(p.lat, p.lon);
      if (vel.speed < 0.02) {
        if (Math.random() < 0.1) this.particles[i] = this.createParticle();
        continue;
      }

      p.prevLat = p.lat;
      p.prevLon = p.lon;

      // Advect position
      p.lon += vel.u * dt * 2.2;
      p.lat += vel.v * dt * 2.0;

      // Coordinate mapping to canvas
      const x0 = ((p.prevLon - this.bounds.west) / lonSpan) * w;
      const y0 = ((this.bounds.north - p.prevLat) / latSpan) * h;
      const x1 = ((p.lon - this.bounds.west) / lonSpan) * w;
      const y1 = ((this.bounds.north - p.lat) / latSpan) * h;

      // Skip draw on periodic longitude wrap
      if (Math.abs(x1 - x0) > w * 0.4) continue;

      // Calculate luminosity based on speed and particle lifecycle curve
      const lifeNorm = Math.sin((p.age / p.maxAge) * Math.PI);
      const alpha = Math.min(0.9, (0.35 + vel.speed * 0.55) * lifeNorm);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);

      // Color coding: fast jets glow electric white, moderate currents glow ice-cyan
      if (vel.speed > 0.8) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      } else if (vel.speed > 0.4) {
        ctx.strokeStyle = `rgba(200, 245, 255, ${alpha * 0.9})`;
      } else {
        ctx.strokeStyle = `rgba(130, 225, 255, ${alpha * 0.75})`;
      }

      ctx.lineWidth = p.lineWidth;
      ctx.stroke();
    }
  }

  getCanvas() {
    return this.canvas;
  }
}
