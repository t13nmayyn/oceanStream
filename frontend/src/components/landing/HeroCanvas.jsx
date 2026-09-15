import { useEffect, useRef } from 'react';

// Procedural ocean particle canvas — no Three.js needed
// Uses canvas2D with GSAP-friendly animation loop
export default function HeroCanvas() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const particlesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Resize handler
    function resize() {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      initParticles();
    }

    function initParticles() {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const count = Math.min(180, Math.floor((W * H) / 6000));
      particlesRef.current = Array.from({ length: count }, () => createParticle(W, H));
    }

    function createParticle(W, H) {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(Math.random() * 0.4 + 0.05),
        size: Math.random() * 1.8 + 0.4,
        alpha: Math.random() * 0.5 + 0.1,
        alphaDir: Math.random() > 0.5 ? 1 : -1,
        hue: Math.random() > 0.65 ? 185 : Math.random() > 0.5 ? 260 : 195,
        life: 0,
        maxLife: Math.random() * 300 + 150,
      };
    }

    let t = 0;

    function drawWaveLayer(W, H, yBase, amplitude, frequency, phase, alpha, color) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 3) {
        const y =
          yBase +
          Math.sin(x * frequency + phase + t * 0.6) * amplitude +
          Math.sin(x * frequency * 1.7 + phase * 1.3 + t * 0.4) * (amplitude * 0.4) +
          Math.sin(x * frequency * 0.4 + t * 0.25) * (amplitude * 0.6);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function draw() {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      t += 0.012;

      ctx.clearRect(0, 0, W, H);

      // Deep ocean gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, '#03050c');
      gradient.addColorStop(0.4, '#060c1a');
      gradient.addColorStop(0.75, '#071224');
      gradient.addColorStop(1, '#04091a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);

      // Subtle radial glow — center-right
      const glow = ctx.createRadialGradient(W * 0.72, H * 0.3, 0, W * 0.72, H * 0.3, W * 0.5);
      glow.addColorStop(0, 'rgba(0, 200, 255, 0.04)');
      glow.addColorStop(0.5, 'rgba(123, 90, 245, 0.025)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Grid lines (faint ocean grid)
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.025)';
      ctx.lineWidth = 0.5;
      const gridSize = 56;
      for (let x = 0; x < W; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Wave layers — deep to surface
      const waveBase = H * 0.68;
      drawWaveLayer(W, H, waveBase + 40, 18, 0.006, 0,      0.06, 'rgba(0, 120, 180, 0.9)');
      drawWaveLayer(W, H, waveBase + 20, 22, 0.007, 1.2,    0.07, 'rgba(0, 140, 200, 0.85)');
      drawWaveLayer(W, H, waveBase,      26, 0.0055, 2.5,   0.08, 'rgba(0, 160, 220, 0.75)');
      drawWaveLayer(W, H, waveBase - 18, 20, 0.008, 0.8,    0.05, 'rgba(0, 180, 240, 0.5)');
      drawWaveLayer(W, H, waveBase - 30, 15, 0.009, 3.1,    0.04, 'rgba(0, 200, 255, 0.3)');

      // Wave highlight line
      ctx.beginPath();
      ctx.moveTo(0, waveBase - 30);
      for (let x = 0; x <= W; x += 3) {
        const y =
          waveBase - 30 +
          Math.sin(x * 0.009 + 3.1 + t * 0.6) * 15 +
          Math.sin(x * 0.015 + t * 0.4) * 6;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Particles
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        p.alpha += p.alphaDir * 0.004;
        if (p.alpha > 0.65) p.alphaDir = -1;
        if (p.alpha < 0.05) p.alphaDir = 1;

        if (p.life > p.maxLife || p.y < -10 || p.x < -10 || p.x > W + 10) {
          particles[i] = createParticle(W, H);
          particles[i].y = H * 0.9; // spawn from wave area
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${p.alpha})`;
        ctx.fill();
      }

      // Scan line effect (subtle)
      const scanY = ((t * 40) % (H + 100)) - 50;
      const scanGrad = ctx.createLinearGradient(0, scanY, 0, scanY + 80);
      scanGrad.addColorStop(0, 'transparent');
      scanGrad.addColorStop(0.5, 'rgba(0, 200, 255, 0.025)');
      scanGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY, W, 80);

      // Depth scale on right side
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(107, 131, 166, 0.5)';
      ctx.textAlign = 'right';
      const depths = ['0m', '200m', '500m', '1000m', '2000m', '4000m'];
      depths.forEach((d, i) => {
        const y = (H * 0.65) + (i * H * 0.06);
        if (y < H - 10) {
          ctx.fillText(d, W - 16, y);
          ctx.beginPath();
          ctx.moveTo(W - 36, y - 3);
          ctx.lineTo(W - 28, y - 3);
          ctx.strokeStyle = 'rgba(107, 131, 166, 0.3)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      });
      ctx.textAlign = 'left';

      animRef.current = requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
      aria-hidden="true"
    />
  );
}
