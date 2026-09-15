import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const variables = [
  {
    name: 'Sea Temperature',
    varCode: 'thetao',
    unit: '°C',
    category: 'Physics',
    accentColor: '#e8545a',
    range: '−2 to 32 °C',
    desc: 'Sea water potential temperature from surface to abyssal depths. Key indicator of ocean heat content, thermocline depth and climate variability.',
  },
  {
    name: 'Salinity',
    varCode: 'so',
    unit: 'PSU',
    category: 'Physics',
    accentColor: '#168ca0',
    range: '30 – 36.5 PSU',
    desc: 'Practical salinity measuring dissolved salt concentration. Drives thermohaline circulation and water mass formation across ocean basins.',
  },
  {
    name: 'Ocean Currents',
    varCode: 'uo / vo',
    unit: 'm/s',
    category: 'Physics',
    accentColor: '#5a6ab5',
    range: '0 – 1.5 m/s',
    desc: 'Eastward (U) and northward (V) velocity components. Powers particle flow visualization and drift prediction for maritime operations.',
  },
  {
    name: 'Sea Surface Height',
    varCode: 'zos',
    unit: 'm',
    category: 'Physics',
    accentColor: '#2daa7a',
    range: '−1.5 to 1.5 m',
    desc: 'Deviation from mean geoid. Encodes geostrophic current information and tracks mesoscale eddies.',
  },
  {
    name: 'Chlorophyll-a',
    varCode: 'chl',
    unit: 'mg/m³',
    category: 'BGC',
    accentColor: '#2daa7a',
    range: '0.01 – 5.0 mg/m³',
    desc: 'Phytoplankton biomass proxy and primary productivity indicator. Essential for fisheries zone prediction and ocean color remote sensing.',
  },
  {
    name: 'Dissolved Oxygen',
    varCode: 'o2',
    unit: 'mmol/m³',
    category: 'BGC',
    accentColor: '#168ca0',
    range: '50 – 350 mmol/m³',
    desc: 'Oxygen saturation indicates ecosystem health. Hypoxic zones threaten marine biodiversity and fisheries sustainability.',
  },
  {
    name: 'Nitrate',
    varCode: 'no3',
    unit: 'mmol/m³',
    category: 'BGC',
    accentColor: '#c08a2a',
    range: '0 – 40 mmol/m³',
    desc: 'Primary macronutrient limiting phytoplankton growth. Tracks upwelling events, nutrient supply and new production potential.',
  },
  {
    name: 'Phosphate',
    varCode: 'po4',
    unit: 'mmol/m³',
    category: 'BGC',
    accentColor: '#b86030',
    range: '0 – 3 mmol/m³',
    desc: 'Secondary macronutrient co-limiting phytoplankton in tropical waters. Indicator of ocean biogeochemical cycling.',
  },
  {
    name: 'Ocean pH',
    varCode: 'ph',
    unit: 'pH scale',
    category: 'BGC',
    accentColor: '#5a6ab5',
    range: '7.9 – 8.3',
    desc: 'Seawater acidity measure. Declining pH (ocean acidification) driven by CO₂ absorption threatens coral reefs and shellfish.',
  },
  {
    name: 'Surface pCO₂',
    varCode: 'spco2',
    unit: 'µatm',
    category: 'BGC',
    accentColor: '#e8545a',
    range: '280 – 550 µatm',
    desc: 'Partial pressure of CO₂ at sea surface. Determines whether ocean is a carbon source or sink — critical for climate models.',
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
};

export default function SectionVariables() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="landing-section os-section-dark"
    >
      <div className="os-container" ref={ref}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '52px' }}
        >
          <span className="os-label">Ocean Variables</span>
          <h2 className="os-heading" style={{ marginBottom: '16px' }}>
            10 essential oceanographic variables.
          </h2>
          <p className="os-body" style={{ maxWidth: '520px', margin: '0 auto' }}>
            From sea surface temperature to deep-ocean pH, oceanStream serves the complete
            physical and biogeochemical picture of the Indian Ocean and beyond.
          </p>
        </motion.div>

        {/* Variable Cards — 2 rows: 4 Physics + 6 BGC */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '8px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(180,210,208,0.5)',
              marginBottom: '10px',
            }}
          >
            PHYSICS
          </div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}
            className="vars-grid-4"
          >
            {variables.filter(v => v.category === 'Physics').map((v) => (
              <VarCard key={v.varCode} v={v} />
            ))}
          </motion.div>
        </div>

        <div>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '8px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(180,210,208,0.5)',
              marginBottom: '10px',
            }}
          >
            BIOGEOCHEMICAL (BGC-Argo)
          </div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}
            className="vars-grid-6"
          >
            {variables.filter(v => v.category === 'BGC').map((v) => (
              <VarCard key={v.varCode} v={v} compact />
            ))}
          </motion.div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .vars-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .vars-grid-6 { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .vars-grid-4, .vars-grid-6 { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}

function VarCard({ v, compact = false }) {
  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
      }}
      style={{
        padding: compact ? '14px' : '18px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTop: `2px solid ${v.accentColor}60`,
        cursor: 'default',
      }}
      whileHover={{
        background: 'rgba(255,255,255,0.09)',
        borderColor: `${v.accentColor}40`,
        y: -3,
        transition: { duration: 0.2 },
      }}
    >
      {/* Variable name + code */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <h3 style={{ fontSize: compact ? '12px' : '13px', fontWeight: 600, color: '#d8e8e6', lineHeight: 1.3 }}>
          {v.name}
        </h3>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '8px',
            color: 'rgba(180,210,208,0.45)',
            whiteSpace: 'nowrap',
            marginLeft: '6px',
            flexShrink: 0,
          }}
        >
          {v.varCode}
        </span>
      </div>

      {/* Unit */}
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '11px',
          fontWeight: 700,
          color: v.accentColor,
          marginBottom: compact ? '4px' : '8px',
        }}
      >
        {v.unit}
      </div>

      {/* Range */}
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '9px',
          color: 'rgba(180,210,208,0.5)',
          marginBottom: compact ? '0' : '8px',
        }}
      >
        {v.range}
      </div>

      {/* Description — hide on compact */}
      {!compact && (
        <p style={{ fontSize: '11px', lineHeight: 1.6, color: 'rgba(180,210,208,0.65)' }}>
          {v.desc}
        </p>
      )}
    </motion.article>
  );
}
