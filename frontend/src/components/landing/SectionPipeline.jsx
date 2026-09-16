import { useState, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  Globe2,
  GitMerge,
} from 'lucide-react';

const sources = [
  {
    id: 'cmems',
    label: 'Numerical Ocean Models',
    sub: 'Copernicus Marine (CMEMS)',
    category: 'MODEL DATA',
    color: '#168ca0',
    accentBg: 'rgba(22, 140, 160, 0.06)',
    borderColor: '#9ed6de',
    glowColor: 'rgba(22, 140, 160, 0.18)',
    format: 'NetCDF4 / Zarr Grids',
    desc: 'GLOBAL_ANALYSISFORECAST_PHY_001_024 + GLORYS12 reanalysis — global physics fields updated daily.',
  },
  {
    id: 'argo',
    label: 'Core Argo Floats',
    sub: 'argopy / ERDDAP',
    category: 'OBSERVATION DATA',
    color: '#5a6ab5',
    accentBg: 'rgba(90, 106, 181, 0.06)',
    borderColor: '#bac1e8',
    glowColor: 'rgba(90, 106, 181, 0.18)',
    format: 'NetCDF / ERDDAP',
    desc: 'Temperature and salinity vertical profiles to 2000 m from over 4,000 autonomous floats.',
  },
  {
    id: 'bgc',
    label: 'BGC Observations',
    sub: 'BGC-Argo / CMEMS BGC',
    category: 'OBSERVATION DATA',
    color: '#2daa7a',
    accentBg: 'rgba(45, 170, 122, 0.06)',
    borderColor: '#9fd5bc',
    glowColor: 'rgba(45, 170, 122, 0.18)',
    format: 'BGC NetCDF Probes',
    desc: 'Chlorophyll, oxygen, nitrate, pH, and pCO₂ from autonomous biogeochemical float sensors.',
  },
  {
    id: 'aodn',
    label: 'Coastal Moorings',
    sub: 'AODN / IMOS CTD',
    category: 'OBSERVATION DATA',
    color: '#c08a2a',
    accentBg: 'rgba(192, 138, 42, 0.06)',
    borderColor: '#e5cca0',
    glowColor: 'rgba(192, 138, 42, 0.18)',
    format: 'OPeNDAP Feeds',
    desc: 'High-frequency coastal mooring CTD timeseries from the Integrated Marine Observing System.',
  },
];

const techStack = ['FastAPI', 'WebSocket', 'Page Table', 'LRU Cache'];

export default function SectionPipeline() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const shouldReduceMotion = useReducedMotion();
  const [activeSourceId, setActiveSourceId] = useState(null);

  return (
    <section
      className="landing-section os-pipeline-section"
      style={{
        background: 'linear-gradient(180deg, #e7efed 0%, #ebf2f1 28%, #1e333d 72%, #091320 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '96px 0 112px',
      }}
    >
      {/* Subtle coordinate dot grid background */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(22, 140, 160, 0.04) 0%, transparent 60%),
            radial-gradient(#b8cbca 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 32px 32px',
          pointerEvents: 'none',
          opacity: 0.55,
        }}
      />

      {/* Seamless bottom divider bridge */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.22) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" ref={ref} style={{ position: 'relative', zIndex: 1 }}>

        {/* Section Header */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 48px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
            <span className="os-label" style={{ margin: 0 }}>ONE PLATFORM</span>
          </div>

          <h2 className="os-heading" style={{ marginBottom: '16px', color: '#111a20' }}>
            Every ocean data source. Unified.
          </h2>

          <p className="os-body" style={{ margin: '0 auto', color: '#384d56' }}>
            oceanStream integrates heterogeneous data sources into a single coherent
            access layer with sub-millisecond cached retrieval.
          </p>
        </motion.div>

        {/* Data Unification Flow: 4 Sources → Converging Bus → oceanStream Core Hub */}
        <div className="os-unification-flow-wrapper" style={{ width: '100%' }}>

          {/* 4 Ingestion Sources Grid */}
          <div
            className="os-sources-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
            }}
          >
            {sources.map((src, index) => {
              const isActive = activeSourceId === src.id;

              return (
                <motion.div
                  key={src.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.1 + index * 0.05, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={shouldReduceMotion ? {} : { y: -3, transition: { duration: 0.16, ease: 'easeOut' } }}
                  whileTap={{ scale: 0.99 }}
                  className={`os-source-card ${isActive ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveSourceId(src.id)}
                  onMouseLeave={() => setActiveSourceId(null)}
                  style={{
                    background: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.92)',
                    border: `1px solid ${isActive ? src.color : '#dce5e3'}`,
                    borderTop: `3px solid ${src.color}`,
                    borderRadius: '14px',
                    padding: '22px 20px 18px',
                    boxShadow: isActive
                      ? `0 12px 28px ${src.glowColor}, 0 2px 6px rgba(0,0,0,0.03)`
                      : '0 2px 10px rgba(22, 40, 44, 0.02)',
                    transition: 'border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                  }}
                >
                  {/* Category Chip */}
                  <div style={{ marginBottom: '12px' }}>
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        color: src.color,
                      }}
                    >
                      {src.category}
                    </span>
                  </div>

                  {/* Source Label & Subtitle */}
                  <div style={{ marginBottom: '10px' }}>
                    <div
                      style={{
                        fontFamily: 'Manrope, sans-serif',
                        fontSize: '17px',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: '#111a20',
                        lineHeight: 1.25,
                        marginBottom: '3px',
                      }}
                    >
                      {src.label}
                    </div>

                    <div
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: src.color,
                      }}
                    >
                      {src.sub}
                    </div>
                  </div>

                  {/* Factual Description */}
                  <p
                    style={{
                      fontSize: '12.5px',
                      lineHeight: 1.6,
                      color: '#44565e',
                      margin: '0 0 16px 0',
                      flexGrow: 1,
                    }}
                  >
                    {src.desc}
                  </p>

                  {/* Format Footer */}
                  <div
                    style={{
                      paddingTop: '10px',
                      borderTop: '1px solid #eef3f2',
                      fontSize: '10.5px',
                      fontFamily: 'JetBrains Mono, monospace',
                      color: '#60757d',
                      fontWeight: 500,
                    }}
                  >
                    <span>{src.format}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Converging SVG Flow Bus */}
          <div
            className="os-converging-bus-container"
            style={{
              width: '100%',
              height: '70px',
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <svg
              viewBox="0 0 1000 70"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
              aria-hidden="true"
            >
              <path
                d="M 125,0 C 125,35 440,30 440,70"
                fill="none"
                stroke="#168ca0"
                strokeWidth={activeSourceId === 'cmems' ? '2.5' : '1.2'}
                strokeDasharray={activeSourceId === 'cmems' ? 'none' : '4 3'}
                opacity={activeSourceId && activeSourceId !== 'cmems' ? '0.25' : '0.75'}
                style={{ transition: 'all 0.25s ease' }}
              />

              <path
                d="M 375,0 C 375,35 480,30 480,70"
                fill="none"
                stroke="#5a6ab5"
                strokeWidth={activeSourceId === 'argo' ? '2.5' : '1.2'}
                strokeDasharray={activeSourceId === 'argo' ? 'none' : '4 3'}
                opacity={activeSourceId && activeSourceId !== 'argo' ? '0.25' : '0.75'}
                style={{ transition: 'all 0.25s ease' }}
              />

              <path
                d="M 625,0 C 625,35 520,30 520,70"
                fill="none"
                stroke="#2daa7a"
                strokeWidth={activeSourceId === 'bgc' ? '2.5' : '1.2'}
                strokeDasharray={activeSourceId === 'bgc' ? 'none' : '4 3'}
                opacity={activeSourceId && activeSourceId !== 'bgc' ? '0.25' : '0.75'}
                style={{ transition: 'all 0.25s ease' }}
              />

              <path
                d="M 875,0 C 875,35 560,30 560,70"
                fill="none"
                stroke="#c08a2a"
                strokeWidth={activeSourceId === 'aodn' ? '2.5' : '1.2'}
                strokeDasharray={activeSourceId === 'aodn' ? 'none' : '4 3'}
                opacity={activeSourceId && activeSourceId !== 'aodn' ? '0.25' : '0.75'}
                style={{ transition: 'all 0.25s ease' }}
              />

              <circle cx="500" cy="68" r="4.5" fill="#168ca0" opacity="0.9" />
            </svg>
          </div>

          {/* Central Destination: oceanStream Integration Hub */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.28, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="os-central-engine-card"
              style={{
                width: 'min(640px, 100%)',
                padding: '28px 32px 24px',
                borderRadius: '16px',
                background: '#131b22',
                border: '1px solid rgba(106, 184, 190, 0.35)',
                boxShadow: '0 16px 40px rgba(19, 27, 34, 0.12), 0 0 24px rgba(22, 140, 160, 0.08)',
                textAlign: 'center',
              }}
            >
              {/* Header Label */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '9.5px',
                  color: '#7ecad0',
                  letterSpacing: '0.08em',
                  marginBottom: '10px',
                }}
              >
                <GitMerge size={12} color="#7ecad0" />
                <span>CENTRAL INTEGRATION LAYER</span>
              </div>

              {/* Title */}
              <div
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  fontSize: '24px',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: '#ffffff',
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ color: '#168ca0' }}>≈</span>
                <span>oceanStream</span>
              </div>

              <div
                style={{
                  fontSize: '13.5px',
                  color: '#b8d6dc',
                  marginBottom: '16px',
                  lineHeight: 1.5,
                }}
              >
                Harmonizing gridded numerical models with autonomous in-situ observations
              </div>

              {/* Protocol Chips */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                {techStack.map((t) => (
                  <motion.span
                    key={t}
                    whileHover={shouldReduceMotion ? {} : { y: -1, transition: { duration: 0.15 } }}
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '10.5px',
                      padding: '3px 10px',
                      borderRadius: '5px',
                      background: 'rgba(106, 184, 190, 0.15)',
                      border: '1px solid rgba(106, 184, 190, 0.35)',
                      color: '#9de0e4',
                      fontWeight: 600,
                      display: 'inline-block',
                      cursor: 'default',
                    }}
                  >
                    {t}
                  </motion.span>
                ))}
              </div>

              {/* Harmonization Note */}
              <div
                style={{
                  fontSize: '11.5px',
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#9de0e4',
                  paddingTop: '12px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  fontWeight: 500,
                }}
              >
                Sub-millisecond cached queries · Non-blocking background fetch
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <style>{`
        .os-sources-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        @media (max-width: 960px) {
          .os-sources-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 16px !important;
          }
          .os-converging-bus-container {
            display: none !important;
          }
        }

        @media (max-width: 580px) {
          .os-pipeline-section {
            padding: 64px 0 76px !important;
          }
          .os-sources-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .os-central-engine-card {
            padding: 22px 18px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .os-source-card,
          .os-central-engine-card,
          .os-converging-bus-container * {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
