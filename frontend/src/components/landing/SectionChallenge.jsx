import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const dims = [
  {
    index: '01',
    label: 'Latitude',
    unit: '°N / °S',
    color: '#168ca0',
    borderColor: '#a9d8dc',
    desc: 'North–South geographic position across the ocean surface and sub-surface layers.',
  },
  {
    index: '02',
    label: 'Longitude',
    unit: '°E / °W',
    color: '#5a6ab5',
    borderColor: '#b0b8e0',
    desc: 'East–West geographic position spanning ocean basins and regional seas.',
  },
  {
    index: '03',
    label: 'Depth',
    unit: 'metres',
    color: '#2daa7a',
    borderColor: '#9fd5bc',
    desc: 'Vertical layer from surface (0 m) down to the abyssal plains (> 4000 m).',
  },
  {
    index: '04',
    label: 'Time',
    unit: 'YYYY-MM-DD',
    color: '#c08a2a',
    borderColor: '#e0c88a',
    desc: 'Temporal evolution — from historical reanalysis back to 10-day forecast ahead.',
  },
];

const stats = [
  { value: '~400', label: 'daily CMEMS model releases', color: '#168ca0' },
  { value: '4,000+', label: 'active Argo floats globally', color: '#5a6ab5' },
  { value: '5,500 m', label: 'max Argo profiling depth', color: '#2daa7a' },
];

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function SectionChallenge() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      className="landing-section"
      style={{ background: '#f6f8f7' }}
    >
      <div className="os-container" ref={ref}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: '56px', maxWidth: '680px' }}
        >
          <span className="os-label">The Challenge</span>
          <h2 className="os-heading" style={{ marginBottom: '18px' }}>
            The ocean is not a flat map.
          </h2>
          <p className="os-body">
            Ocean datasets encode enormous information across space, depth and time.
            Traditional 2D maps capture only a fraction of this reality. True ocean
            understanding requires navigating four independent dimensions simultaneously.
          </p>
        </motion.div>

        {/* 4D Dimension Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '14px',
            marginBottom: '40px',
          }}
          className="challenge-grid"
        >
          {dims.map((d) => (
            <motion.div
              key={d.label}
              variants={cardVariants}
              className="os-card os-card-sm"
              style={{ borderTop: `3px solid ${d.borderColor}`, paddingTop: '22px' }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
            >
              {/* Index */}
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  color: d.color,
                  marginBottom: '10px',
                }}
              >
                DIM {d.index}
              </div>

              {/* Label */}
              <div
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  fontSize: '20px',
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                  color: '#172027',
                  marginBottom: '4px',
                }}
              >
                {d.label}
              </div>

              {/* Unit */}
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  color: d.color,
                  marginBottom: '12px',
                  fontWeight: 600,
                }}
              >
                {d.unit}
              </div>

              {/* Description */}
              <p style={{ fontSize: '12px', lineHeight: 1.65, color: '#66747a' }}>
                {d.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Statistics row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.6 }}
          style={{
            background: '#ffffff',
            border: '1px solid #dce4e2',
            borderRadius: '16px',
            padding: '32px 40px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '32px',
              textAlign: 'center',
            }}
            className="stats-grid"
          >
            {stats.map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontFamily: 'Manrope, sans-serif',
                    fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
                    fontWeight: 800,
                    letterSpacing: '-0.04em',
                    color: s.color,
                    lineHeight: 1,
                    marginBottom: '8px',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: '12px', color: '#7a9094' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid #edf2f1',
              textAlign: 'center',
              fontSize: '13px',
              color: '#7a9094',
            }}
          >
            oceanStream makes this data accessible in{' '}
            <span style={{ color: '#168ca0', fontWeight: 600 }}>under 1 millisecond</span>
            {' '}for cached queries and{' '}
            <span style={{ color: '#2daa7a', fontWeight: 600 }}>never blocks</span>
            {' '}the user interface during origin fetches.
          </div>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .challenge-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .stats-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
        }
        @media (max-width: 500px) {
          .challenge-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
