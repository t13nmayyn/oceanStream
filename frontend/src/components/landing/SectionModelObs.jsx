import { useState, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpDown, ArrowDown } from 'lucide-react';

export default function SectionModelObs() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const shouldReduceMotion = useReducedMotion();
  const [hoveredStage, setHoveredStage] = useState(null);

  return (
    <section
      className="landing-section os-model-obs-section"
      style={{
        background: 'linear-gradient(180deg, #02070e 0%, #040d17 50%, #07101c 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '96px 0 108px',
      }}
    >
      {/* Seamless top divider bridge */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(56, 189, 248, 0.2) 50%, transparent 95%)',
        }}
      />

      {/* Subtle coordinate dot pattern */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(22, 140, 160, 0.05) 0%, transparent 60%),
            linear-gradient(to right, rgba(255, 255, 255, 0.012) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.012) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Seamless bottom divider bridge */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.18) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" ref={ref} style={{ position: 'relative', zIndex: 1, maxWidth: '840px' }}>

        {/* Section Header */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 48px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '14px' }}>
            <span className="os-label" style={{ margin: 0, color: '#7ecad0' }}>
              CROSS-VALIDATION
            </span>
          </div>

          <h2
            className="os-heading"
            style={{
              color: '#ffffff',
              fontSize: 'clamp(2rem, 3.8vw, 3rem)',
              marginBottom: '16px',
            }}
          >
            Models meet reality.
          </h2>

          <p
            className="os-body"
            style={{
              fontSize: '16px',
              lineHeight: 1.68,
              color: '#d1e3e8',
              margin: '0 auto',
            }}
          >
            Numerical ocean models provide continuous global coverage. Autonomous Argo floats
            deliver ground truth. oceanStream harmonizes both into a unified scientific view.
          </p>
        </motion.div>

        {/* Unified Vertical Flow: MODEL ↕ OBSERVATION ↓ OCEANSTREAM */}
        <div className="os-scientific-storytelling-flow" style={{ width: '100%' }}>

          {/* STAGE 1: MODEL */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            whileHover={shouldReduceMotion ? {} : { y: -2, transition: { duration: 0.16, ease: 'easeOut' } }}
            whileTap={{ scale: 0.995 }}
            onMouseEnter={() => setHoveredStage('model')}
            onMouseLeave={() => setHoveredStage(null)}
            style={{
              background: hoveredStage === 'model' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderLeft: '3.5px solid #168ca0',
              borderRadius: '14px',
              padding: '24px 28px',
              transition: 'background 0.22s ease, border-color 0.22s ease',
              cursor: 'default',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#38bdf8',
                }}
              >
                01 · NUMERICAL OCEAN MODEL
              </span>

              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#7ecad0', fontWeight: 600 }}>
                CMEMS · GLOBAL_ANALYSISFORECAST_PHY_001_024
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <h3
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#ffffff',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Copernicus Gridded 4D Simulation
              </h3>

              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '17px', fontWeight: 800, color: '#38bdf8' }}>
                28.42 °C <span style={{ fontSize: '11px', fontWeight: 500, color: '#a0bec7' }}>@ 50m</span>
              </div>
            </div>

            <p style={{ fontSize: '13.5px', lineHeight: 1.65, color: '#d6e7eb', margin: 0 }}>
              Continuous 1/12° resolution global hydrodynamic grid assimilating altimetry, satellite SST, and in-situ records into a 10-day prognostic forecast.
            </p>
          </motion.div>

          {/* INTER-COMPARISON CONNECTOR (↕) */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.35, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 0',
            }}
          >
            <div style={{ width: '1px', height: '14px', background: 'linear-gradient(to bottom, #168ca0, rgba(255,255,255,0.2))' }} />
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                borderRadius: '20px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '10.5px',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600,
                color: '#d1e5eb',
                margin: '4px 0',
                cursor: 'default',
                transition: 'background 0.2s ease',
              }}
            >
              <ArrowUpDown size={12} color="#7ecad0" />
              <span>CROSS-COMPARISON & GROUND-TRUTH VALIDATION</span>
            </div>
            <div style={{ width: '1px', height: '14px', background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), #2daa7a)' }} />
          </motion.div>

          {/* STAGE 2: OBSERVATION */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            whileHover={shouldReduceMotion ? {} : { y: -2, transition: { duration: 0.16, ease: 'easeOut' } }}
            whileTap={{ scale: 0.995 }}
            onMouseEnter={() => setHoveredStage('obs')}
            onMouseLeave={() => setHoveredStage(null)}
            style={{
              background: hoveredStage === 'obs' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderLeft: '3.5px solid #2dd4bf',
              borderRadius: '14px',
              padding: '24px 28px',
              transition: 'background 0.22s ease, border-color 0.22s ease',
              cursor: 'default',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#2dd4bf',
                }}
              >
                02 · IN-SITU OBSERVATION
              </span>

              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#48cfa0', fontWeight: 600 }}>
                Argo Float #2902765 · In-Situ CTD
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <h3
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#ffffff',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Autonomous Vertical CTD Sounding
              </h3>

              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '17px', fontWeight: 800, color: '#2dd4bf' }}>
                28.74 °C <span style={{ fontSize: '11px', fontWeight: 500, color: '#a0bec7' }}>@ 50m</span>
              </div>
            </div>

            <p style={{ fontSize: '13.5px', lineHeight: 1.65, color: '#d6e7eb', margin: 0 }}>
              Physical sensor measurements recorded by autonomous profiling floats during ascent from 2,000 m to sea surface, providing calibrated ground truth.
            </p>
          </motion.div>

          {/* DOWNWARD INTEGRATION CONNECTOR (↓) */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0.9 } : { opacity: 0, y: -3 }}
            animate={inView ? { opacity: 0.9, y: 0 } : {}}
            transition={{ duration: 0.35, delay: 0.26 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 0',
            }}
          >
            <div style={{ width: '1px', height: '18px', background: 'linear-gradient(to bottom, #2daa7a, #38bdf8)' }} />
            <div style={{ color: '#38bdf8', opacity: 0.9, marginTop: '2px' }}>
              <ArrowDown size={15} />
            </div>
          </motion.div>

          {/* STAGE 3: OCEANSTREAM UNIFIED PLATFORM */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.48, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: 'rgba(255, 255, 255, 0.035)',
              border: '1px solid rgba(106, 184, 190, 0.25)',
              borderTop: '3px solid #38bdf8',
              borderRadius: '16px',
              padding: '28px 32px 24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontSize: '22px',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-0.025em',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span style={{ color: '#38bdf8' }}>≈</span>
              <span>oceanStream: Unified Synthesis</span>
            </div>

            <p style={{ fontSize: '13.5px', color: '#b8d6dc', margin: '0 auto 20px', maxWidth: '560px', lineHeight: 1.6 }}>
              Demonstrating why both sources matter: models provide spatial continuity while floats supply physical calibration.
            </p>

            {/* Clean 3-Column Scientific Cross-Comparison */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                padding: '16px 18px',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <div
                style={{ padding: '6px 4px', borderRadius: '6px', cursor: 'default' }}
              >
                <div style={{ fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#a0bec7', marginBottom: '3px' }}>
                  Model Value
                </div>
                <div style={{ fontSize: '18px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, color: '#38bdf8' }}>
                  28.42 °C
                </div>
                <div style={{ fontSize: '10px', color: '#8aa6ae', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>
                  CMEMS Gridded
                </div>
              </div>

              <div
                style={{ padding: '6px 4px', borderRadius: '6px', cursor: 'default' }}
              >
                <div style={{ fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#a0bec7', marginBottom: '3px' }}>
                  Observed Value
                </div>
                <div style={{ fontSize: '18px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, color: '#2dd4bf' }}>
                  28.74 °C
                </div>
                <div style={{ fontSize: '10px', color: '#8aa6ae', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>
                  In-Situ Float @ 50m
                </div>
              </div>

              <div
                style={{ padding: '6px 4px', borderRadius: '6px', cursor: 'default' }}
              >
                <div style={{ fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#a0bec7', marginBottom: '3px' }}>
                  Calculated Offset
                </div>
                <div style={{ fontSize: '18px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, color: '#c4bdf4' }}>
                  +0.32 °C
                </div>
                <div style={{ fontSize: '10px', color: '#8aa6ae', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>
                  Local Model Bias
                </div>
              </div>
            </div>

            {/* Purpose Footer */}
            <div
              style={{
                fontSize: '12px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#c2dce2',
                fontWeight: 500,
              }}
            >
              Simultaneous co-location enables real-time model validation and bias detection
            </div>
          </motion.div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .os-model-obs-section {
            padding: 64px 0 76px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .os-scientific-storytelling-flow * {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
