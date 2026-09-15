import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

function DataRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #edf2f1' }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#7a9094' }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: 600, color: color || '#172027' }}>{value}</span>
    </div>
  );
}

function Tag({ label, bg, color, border }) {
  return (
    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 8px', borderRadius: '4px', background: bg, color, border: `1px solid ${border}` }}>
      {label}
    </span>
  );
}

export default function SectionModelObs() {
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
          style={{ textAlign: 'center', marginBottom: '52px' }}
        >
          <span className="os-label">Model + Observations</span>
          <h2 className="os-heading" style={{ marginBottom: '16px' }}>Models meet reality.</h2>
          <p className="os-body" style={{ maxWidth: '560px', margin: '0 auto' }}>
            Ocean models generate gridded forecasts. Argo floats provide ground truth.
            oceanStream shows both side by side — enabling direct validation and scientific insight.
          </p>
        </motion.div>

        {/* Comparison cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 1fr', gap: '14px', alignItems: 'stretch' }}
          className="model-grid">

          {/* Model card */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.55 }}
            style={{ background: '#f8faf9', border: '1px solid #dce4e2', borderTop: '3px solid #168ca0', borderRadius: '14px', padding: '22px' }}
          >
            <Tag label="MODEL DATA" bg="#e5f3f4" color="#168ca0" border="#b2d8dc" />
            <h3 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '16px', fontWeight: 600, color: '#172027', margin: '12px 0 8px' }}>
              Copernicus Ocean Model
            </h3>
            <p style={{ fontSize: '12px', lineHeight: 1.65, color: '#7a9094', marginBottom: '16px' }}>
              Global 1/12° resolution gridded fields from CMEMS GLORYS12 reanalysis and near-real-time
              analysis/forecast products. Updated daily.
            </p>
            {/* Data preview */}
            <div style={{ background: '#fff', border: '1px solid #e4eceb', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#9aacb0', marginBottom: '8px' }}>
                CMEMS · /ocean/point
              </div>
              <DataRow label="temperature" value="28.42 °C" color="#e8545a" />
              <DataRow label="salinity" value="34.91 PSU" color="#168ca0" />
              <DataRow label="current speed" value="0.31 m/s" color="#5a6ab5" />
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {['1/12° grid', 'Daily update', 'L1/L2/L3'].map(t => (
                <span key={t} style={{ fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#e5f3f4', color: '#168ca0', border: '1px solid #b2d8dc', fontFamily: 'JetBrains Mono, monospace' }}>{t}</span>
              ))}
            </div>
          </motion.div>

          {/* Combiner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.35, duration: 0.5 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: '#162028', border: '1px solid rgba(106,184,190,0.2)', borderRadius: '14px', padding: '22px' }}
          >
            <Tag label="COMBINED VIEW" bg="rgba(106,184,190,0.12)" color="#7ecad0" border="rgba(106,184,190,0.3)" />
            <h3 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '15px', fontWeight: 600, color: '#d8e8e6', margin: '12px 0 14px' }}>
              Model + Observation
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px', textAlign: 'left' }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: 'rgba(180,210,208,0.5)', marginBottom: '4px' }}>Model bias</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#b0aee8', fontWeight: 600 }}>+0.32 °C offset</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px', textAlign: 'left' }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: 'rgba(180,210,208,0.5)', marginBottom: '4px' }}>Distance to Argo</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#7ecad0', fontWeight: 600 }}>45.2 km</div>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(180,210,208,0.55)', marginTop: '12px', lineHeight: 1.5 }}>
              Direct comparison enables model validation and scientific quality assurance
            </p>
          </motion.div>

          {/* Observation card */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.55 }}
            style={{ background: '#f8faf9', border: '1px solid #dce4e2', borderTop: '3px solid #2daa7a', borderRadius: '14px', padding: '22px' }}
          >
            <Tag label="OBSERVATION DATA" bg="#e8f7ef" color="#2daa7a" border="#b0d8c0" />
            <h3 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '16px', fontWeight: 600, color: '#172027', margin: '12px 0 8px' }}>
              Argo Float Profile
            </h3>
            <p style={{ fontSize: '12px', lineHeight: 1.65, color: '#7a9094', marginBottom: '16px' }}>
              In-situ CTD measurements from autonomous Argo floats. Core Argo provides T/S profiles;
              BGC-Argo adds oxygen, chlorophyll, nitrate and pH.
            </p>
            {/* Data preview */}
            <div style={{ background: '#fff', border: '1px solid #e4eceb', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#9aacb0', marginBottom: '8px' }}>
                Platform #2902765 · /argo/profile
              </div>
              <DataRow label="depth" value="50 m" color="#5a6ab5" />
              <DataRow label="temperature" value="28.74 °C" color="#e8545a" />
              <DataRow label="salinity" value="34.88 PSU" color="#168ca0" />
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {['In-situ CTD', 'BGC-Argo', 'Real profiles'].map(t => (
                <span key={t} style={{ fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#e8f7ef', color: '#2daa7a', border: '1px solid #b0d8c0', fontFamily: 'JetBrains Mono, monospace' }}>{t}</span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <style>{`
        @media (max-width: 800px) {
          .model-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
