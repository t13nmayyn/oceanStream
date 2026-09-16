import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { Compass, ArrowRight, Layers } from 'lucide-react';

export default function SectionCTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const shouldReduceMotion = useReducedMotion();
  const navigate = useNavigate();

  const handleLaunch = () => {
    if (shouldReduceMotion) {
      navigate('/explorer');
      return;
    }
    gsap.to('.cta-section', {
      opacity: 0,
      scale: 1.01,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => navigate('/explorer'),
    });
  };

  const handleExplorePlatform = (e) => {
    e.preventDefault();
    const challengeEl = document.getElementById('challenge');
    if (challengeEl) {
      challengeEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/analytics');
    }
  };

  return (
    <section
      className="cta-section landing-section relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #07101c 0%, #091626 50%, #070f1a 100%)',
        padding: '88px 0 96px',
        position: 'relative',
      }}
      ref={ref}
    >
      {/* Seamless top divider bridge */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.18) 50%, transparent 95%)',
        }}
      />

      {/* Atmospheric Ambient Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0, 200, 255, 0.07) 0%, rgba(123, 90, 245, 0.03) 50%, transparent 75%)',
        }}
      />

      {/* Subtle Bathymetric Depth Wave Texture */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-15"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 400"
        preserveAspectRatio="none"
      >
        <path
          d="M -100,200 C 300,160 600,240 900,190 C 1200,140 1400,220 1600,180"
          fill="none"
          stroke="rgba(0, 200, 255, 0.3)"
          strokeWidth="1.2"
          strokeDasharray="6 8"
        />
        <path
          d="M -100,260 C 250,220 550,300 880,240 C 1180,180 1380,270 1600,230"
          fill="none"
          stroke="rgba(0, 224, 140, 0.25)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      </svg>

      <div className="relative os-container mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: '780px', textAlign: 'center' }}>
        <div>
          {/* Subtle Label */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}
          >
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10.5px',
                fontWeight: 600,
                color: '#7ecad0',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              4D OCEAN INTELLIGENCE PLATFORM
            </span>
          </motion.div>

          {/* Requested Heading */}
          <motion.h2
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-white tracking-tight"
            style={{
              fontFamily: 'Manrope, Outfit, Inter, sans-serif',
              fontSize: 'clamp(2.2rem, 4.4vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              marginBottom: '16px',
            }}
          >
            See the ocean{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #38bdf8 0%, #00e08c 50%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                display: 'inline-block',
              }}
            >
              differently.
            </span>
          </motion.h2>

          {/* Requested Supporting Text */}
          <motion.p
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.42, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: 'clamp(1.05rem, 1.8vw, 1.25rem)',
              fontWeight: 500,
              lineHeight: 1.5,
              color: '#d4e4ec',
              marginBottom: '10px',
            }}
          >
            Explore ocean conditions across space, depth and time.
          </motion.p>

          <motion.p
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.42, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: '13.5px',
              lineHeight: 1.65,
              color: '#d1e3e8',
              maxWidth: '580px',
              margin: '0 auto 36px',
            }}
          >
            Navigate continuous 4D hydrodynamic grids, vertical CTD soundings from 4,000+ Argo floats,
            and real-time biogeochemical models in an interactive Cesium 3D geospatial environment.
          </motion.p>

          {/* Primary CTA Buttons */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '14px',
            }}
          >
            {/* Primary CTA: Launch Ocean Explorer */}
            <motion.button
              onClick={handleLaunch}
              className="inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl font-semibold text-[15px] cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #0099cc 0%, #00b4d8 50%, #0077b6 100%)',
                color: '#ffffff',
                boxShadow: '0 8px 24px rgba(0, 180, 216, 0.35)',
                border: '1px solid rgba(120, 230, 255, 0.5)',
              }}
              whileHover={shouldReduceMotion ? {} : {
                y: -1.5,
                boxShadow: '0 10px 28px rgba(0, 180, 216, 0.45)',
                transition: { duration: 0.16, ease: 'easeOut' },
              }}
              whileTap={{ scale: 0.985 }}
            >
              <Compass size={18} className="text-cyan-100" />
              <span>Launch Ocean Explorer</span>
              <ArrowRight size={16} className="text-cyan-100" />
            </motion.button>

            {/* Secondary CTA: Explore the platform */}
            <motion.button
              onClick={handleExplorePlatform}
              className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl font-medium text-[14.5px] cursor-pointer"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#d6e7eb',
              }}
              whileHover={shouldReduceMotion ? {} : {
                y: -1,
                background: 'rgba(255, 255, 255, 0.10)',
                borderColor: 'rgba(0, 200, 255, 0.45)',
                color: '#ffffff',
                transition: { duration: 0.16, ease: 'easeOut' },
              }}
              whileTap={{ scale: 0.985 }}
            >
              <Layers size={16} className="text-cyan-400" />
              <span>Explore Platform Data</span>
            </motion.button>
          </motion.div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .cta-section {
            padding: 56px 0 68px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .cta-section * {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
