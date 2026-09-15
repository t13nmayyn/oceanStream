import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ArrowRight } from 'lucide-react';

export default function SectionCTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const navigate = useNavigate();

  const handleLaunch = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) { navigate('/explorer'); return; }
    gsap.to('.cta-section', {
      opacity: 0, scale: 1.02, duration: 0.45, ease: 'power2.in',
      onComplete: () => navigate('/explorer'),
    });
  };

  return (
    <section
      className="cta-section landing-section relative overflow-hidden"
      style={{ background: '#162028', paddingTop: '120px', paddingBottom: '120px' }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,200,255,0.05) 0%, transparent 70%)',
        }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,200,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.025) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative os-container text-center" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <div
            className="inline-block text-[10px] font-mono font-semibold tracking-[0.2em] uppercase px-3 py-1 rounded-full mb-8"
            style={{
              background: 'rgba(0, 200, 255, 0.08)',
              border: '1px solid rgba(0, 200, 255, 0.2)',
              color: 'rgba(0, 200, 255, 0.8)',
            }}
          >
            INCOIS · Ministry of Earth Sciences · SIH 2026
          </div>

          <h2
            className="font-display text-white mb-6"
            style={{
              fontFamily: 'Outfit, Inter, sans-serif',
              fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
            }}
          >
            See the ocean
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, #00c8ff 0%, #7b5af5 60%, #00e08c 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              differently.
            </span>
          </h2>

          <p
            className="text-muted mx-auto mb-10"
            style={{ fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '480px' }}
          >
            Explore multidimensional ocean data through an interactive scientific environment
            powered by CMEMS, Argo, and India's own oceanographic heritage.
          </p>

          <motion.button
            onClick={handleLaunch}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-[15px] cursor-pointer group"
            style={{
              background: 'linear-gradient(135deg, rgba(0,200,255,0.15) 0%, rgba(123,90,245,0.15) 100%)',
              border: '1px solid rgba(0, 200, 255, 0.4)',
              color: '#d4e3f7',
            }}
            whileHover={{
              background: 'linear-gradient(135deg, rgba(0,200,255,0.22) 0%, rgba(123,90,245,0.22) 100%)',
              borderColor: 'rgba(0, 200, 255, 0.6)',
              y: -2,
              transition: { duration: 0.2 },
            }}
            whileTap={{ scale: 0.98 }}
          >
            Launch Ocean Explorer
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </motion.button>

          {/* Data stats */}
          <div className="flex flex-wrap justify-center gap-6 mt-14">
            {[
              { label: 'Data Sources', value: '5+' },
              { label: 'Ocean Variables', value: '12' },
              { label: 'Cache Latency', value: '<1ms' },
              { label: 'Depth Coverage', value: '5500m' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div
                  className="text-[1.6rem] font-bold font-mono"
                  style={{
                    background: 'linear-gradient(135deg, #00c8ff, #7b5af5)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {s.value}
                </div>
                <div className="text-[11px] text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
