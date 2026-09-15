import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const sources = [
  {
    id: 'cmems',
    label: 'Numerical Ocean Models',
    sub: 'Copernicus Marine (CMEMS)',
    color: '#168ca0',
    accentBg: '#e5f3f4',
    desc: 'GLOBAL_ANALYSISFORECAST_PHY_001_024 + GLORYS12 reanalysis — global physics fields updated daily.',
  },
  {
    id: 'argo',
    label: 'Core Argo Floats',
    sub: 'argopy / ERDDAP',
    color: '#5a6ab5',
    accentBg: '#eeeef8',
    desc: 'Temperature and salinity vertical profiles to 2000 m from over 4,000 autonomous floats.',
  },
  {
    id: 'bgc',
    label: 'BGC Observations',
    sub: 'BGC-Argo / CMEMS BGC',
    color: '#2daa7a',
    accentBg: '#e8f7ef',
    desc: 'Chlorophyll, oxygen, nitrate, pH, pCO₂ from biogeochemical float sensors.',
  },
  {
    id: 'aodn',
    label: 'AODN / In-Situ Data',
    sub: 'IMOS CTD Moorings',
    color: '#c08a2a',
    accentBg: '#f7f0e3',
    desc: 'High-frequency coastal mooring CTD timeseries from the Integrated Marine Observing System.',
  },
];

const techStack = ['FastAPI', 'WebSocket', 'Page Table', 'LRU Cache'];

export default function SectionPipeline() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      className="landing-section"
      style={{ background: '#ffffff' }}
    >
      <div className="os-container" ref={ref}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '56px', maxWidth: '600px', margin: '0 auto 56px' }}
        >
          <span className="os-label">One Platform</span>
          <h2 className="os-heading" style={{ marginBottom: '16px' }}>
            Every ocean data source. Unified.
          </h2>
          <p className="os-body">
            oceanStream integrates heterogeneous data sources into a single coherent
            access layer with sub-millisecond cached retrieval.
          </p>
        </motion.div>

        {/* Pipeline Visual */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

          {/* Source cards */}
          <div
            className="pipeline-sources"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              width: '100%',
              marginBottom: '0',
            }}
          >
            {sources.map((src, i) => (
              <motion.div
                key={src.id}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: '#f8faf9',
                  border: '1px solid #dce4e2',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    margin: '0 auto 12px',
                    background: src.accentBg,
                    border: `1px solid ${src.color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: src.color,
                    }}
                  />
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#172027', marginBottom: '4px' }}>
                  {src.label}
                </div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '10px',
                    color: src.color,
                    marginBottom: '8px',
                    fontWeight: 600,
                  }}
                >
                  {src.sub}
                </div>
                <div style={{ fontSize: '11px', color: '#7a9094', lineHeight: 1.5 }}>
                  {src.desc}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Converging visual */}
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            animate={inView ? { opacity: 1, scaleY: 1 } : {}}
            transition={{ delay: 0.5, duration: 0.4, transformOrigin: 'top' }}
            style={{ display: 'flex', justifyContent: 'space-around', width: '70%', height: '44px' }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '1px', flex: 1, background: '#dce4e2' }} />
                <div style={{
                  width: 0, height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '6px solid #b8cece',
                }} />
              </div>
            ))}
          </motion.div>

          {/* Core engine box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.65, duration: 0.5 }}
            style={{
              width: 'min(440px, 100%)',
              padding: '24px 32px',
              borderRadius: '16px',
              background: '#162028',
              border: '1px solid rgba(106, 184, 190, 0.3)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#8bd4d8',
                marginBottom: '6px',
              }}
            >
              oceanStream
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'rgba(180,210,210,0.6)', marginBottom: '14px' }}>
              L1 RAM · L2 Zarr · L3 Copernicus
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '6px' }}>
              {techStack.map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '9px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(106,184,190,0.12)',
                    border: '1px solid rgba(106,184,190,0.25)',
                    color: '#7ecad0',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Arrow down */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.85 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '44px' }}
          >
            <div style={{ width: '1px', flex: 1, background: '#dce4e2' }} />
            <div style={{
              width: 0, height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '6px solid #b8cece',
            }} />
          </motion.div>

          {/* Output card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.95, duration: 0.45 }}
            style={{
              padding: '18px 28px',
              borderRadius: '12px',
              background: '#ffffff',
              border: '1px solid #dce4e2',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#172027', marginBottom: '4px' }}>
              Interactive 3D/4D Ocean Platform
            </div>
            <div style={{ fontSize: '11px', color: '#7a9094' }}>
              Cesium Globe · Chart.js Analytics · Argo Profile Charts · WebSocket Streaming
            </div>
          </motion.div>
        </div>
      </div>

      <style>{`
        @media (max-width: 800px) {
          .pipeline-sources { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 500px) {
          .pipeline-sources { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
