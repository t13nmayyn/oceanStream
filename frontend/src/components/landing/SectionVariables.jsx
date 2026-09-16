import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  Thermometer,
  Droplets,
  Compass,
  Waves,
  Leaf,
  Activity,
  FlaskConical,
  Layers,
  Gauge,
  Globe,
} from 'lucide-react';

const physicalVariables = [
  {
    id: 'thetao',
    name: 'Sea Temperature',
    unit: '°C',
    concept: 'Thermal Stratification & Heat Content',
    accentColor: '#e8545a',
    accentBg: 'rgba(232, 84, 90, 0.1)',
    icon: Thermometer,
    range: '−2 to 32 °C',
    source: 'CMEMS Model + Argo CTD',
    desc: 'Sea water potential temperature from surface to abyssal depths. Key indicator of ocean heat content, thermocline depth and climate variability.',
  },
  {
    id: 'so',
    name: 'Salinity',
    unit: 'PSU',
    concept: 'Halocline & Thermohaline Formation',
    accentColor: '#168ca0',
    accentBg: 'rgba(22, 140, 160, 0.1)',
    icon: Droplets,
    range: '30 – 36.5 PSU',
    source: 'Argo Floats + CMEMS Reanalysis',
    desc: 'Practical salinity measuring dissolved salt concentration. Drives thermohaline circulation and water mass formation across ocean basins.',
  },
  {
    id: 'currents',
    name: 'Ocean Currents',
    unit: 'm/s',
    concept: 'Vector Velocity & Mass Transport',
    accentColor: '#5a6ab5',
    accentBg: 'rgba(90, 106, 181, 0.1)',
    icon: Compass,
    range: '0 – 1.5 m/s',
    source: 'CMEMS PHY 4D Vector Mesh',
    desc: 'Eastward (U) and northward (V) velocity components. Powers particle flow visualization and drift prediction for maritime operations.',
  },
  {
    id: 'zos',
    name: 'Sea Surface Height',
    unit: 'm',
    concept: 'Surface Dynamic Topography',
    accentColor: '#2daa7a',
    accentBg: 'rgba(45, 170, 122, 0.1)',
    icon: Waves,
    range: '−1.5 to 1.5 m',
    source: 'Satellite Altimetry + Tide Gauges',
    desc: 'Deviation from mean geoid. Encodes geostrophic current information and tracks mesoscale eddies across ocean basins.',
  },
];

const bgcVariables = [
  {
    id: 'chl',
    name: 'Chlorophyll-a',
    unit: 'mg/m³',
    concept: 'Phytoplankton Biomass Distribution',
    accentColor: '#2daa7a',
    accentBg: 'rgba(45, 170, 122, 0.1)',
    icon: Leaf,
    range: '0.01 – 5.0 mg/m³',
    source: 'BGC-Argo Optical Probes + CMEMS BGC',
    desc: 'Phytoplankton biomass proxy and primary productivity indicator. Essential for fisheries zone prediction and ocean color remote sensing.',
  },
  {
    id: 'o2',
    name: 'Dissolved Oxygen',
    unit: 'mmol/m³',
    concept: 'Oxygen Minimum Zone Dynamics',
    accentColor: '#168ca0',
    accentBg: 'rgba(22, 140, 160, 0.1)',
    icon: Activity,
    range: '50 – 350 mmol/m³',
    source: 'BGC-Argo Optode Sensors',
    desc: 'Oxygen saturation indicates ecosystem health. Hypoxic zones threaten marine biodiversity and fisheries sustainability.',
  },
  {
    id: 'no3',
    name: 'Nitrate',
    unit: 'mmol/m³',
    concept: 'Nutrient Limitation & Upwelling Influx',
    accentColor: '#c08a2a',
    accentBg: 'rgba(192, 138, 42, 0.1)',
    icon: FlaskConical,
    range: '0 – 40 mmol/m³',
    source: 'BGC-Argo UV Spectrophotometer',
    desc: 'Primary macronutrient limiting phytoplankton growth. Tracks upwelling events, nutrient supply and new production potential.',
  },
  {
    id: 'po4',
    name: 'Phosphate',
    unit: 'mmol/m³',
    concept: 'Biogeochemical Nutrient Cycling',
    accentColor: '#b86030',
    accentBg: 'rgba(184, 96, 48, 0.1)',
    icon: Layers,
    range: '0 – 3 mmol/m³',
    source: 'CMEMS Biogeochemical Assimilation',
    desc: 'Secondary macronutrient co-limiting phytoplankton in tropical waters. Essential for understanding marine nutrient stoichiometry.',
  },
  {
    id: 'ph',
    name: 'Ocean pH',
    unit: 'pH scale',
    concept: 'Ocean Acidification Total Scale',
    accentColor: '#8b7ad8',
    accentBg: 'rgba(139, 122, 216, 0.1)',
    icon: Gauge,
    range: '7.9 – 8.3',
    source: 'ISFET pH Float Electrodes',
    desc: 'Seawater acidity measure. Declining pH driven by anthropogenic CO₂ absorption threatens coral reefs and calcareous organisms.',
  },
  {
    id: 'spco2',
    name: 'Surface pCO₂',
    unit: 'µatm',
    concept: 'Air-Sea Carbon Flux Equilibrium',
    accentColor: '#e8545a',
    accentBg: 'rgba(232, 84, 90, 0.1)',
    icon: Globe,
    range: '280 – 550 µatm',
    source: 'In-Situ Underway + CMEMS Carbon Flux',
    desc: 'Partial pressure of CO₂ at sea surface. Determines whether the ocean acts as a carbon source or sink in global climate models.',
  },
];

function VariableCard({ item, index, inView, shouldReduceMotion }) {
  const Icon = item.icon;

  return (
    <motion.article
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: (index % 4) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={shouldReduceMotion ? {} : { y: -3, borderColor: 'rgba(255, 255, 255, 0.16)', transition: { duration: 0.16, ease: 'easeOut' } }}
      whileTap={{ scale: 0.99 }}
      className="os-editorial-var-card group"
      style={{
        background: 'rgba(255, 255, 255, 0.025)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '16px',
        padding: '28px 28px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        transition: 'background 0.22s ease, border-color 0.22s ease',
        cursor: 'default',
      }}
    >
      <div>
        {/* Top Header Row: Restrained Icon & Concept Label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: item.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: item.accentColor,
            }}
          >
            <Icon size={18} strokeWidth={1.8} />
          </div>

          <span
            style={{
              fontSize: '11px',
              fontFamily: 'JetBrains Mono, monospace',
              color: '#a4c2c9',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {item.concept}
          </span>
        </div>

        {/* Large Clean Variable Name + Unit */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '10px',
            marginBottom: '10px',
          }}
        >
          <h3
            style={{
              fontFamily: 'Manrope, sans-serif',
              fontSize: '21px',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {item.name}
          </h3>

          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '13px',
              fontWeight: 700,
              color: item.accentColor,
            }}
          >
            {item.unit}
          </span>
        </div>

        {/* Small Scientific Description */}
        <p
          style={{
            fontSize: '13.5px',
            lineHeight: 1.65,
            color: '#d6e7eb',
            margin: '0 0 20px 0',
          }}
        >
          {item.desc}
        </p>
      </div>

      {/* Discrete Range & Provenance Note */}
      <div
        style={{
          paddingTop: '12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          color: '#a0bec7',
        }}
      >
        <span>Typical: <strong style={{ color: '#ffffff', fontWeight: 600 }}>{item.range}</strong></span>
        <span style={{ color: '#8da8b0' }}>{item.source}</span>
      </div>
    </motion.article>
  );
}

export default function SectionVariables() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      className="landing-section os-section-dark os-variables-section"
      style={{
        background: 'linear-gradient(180deg, #091320 0%, #0b1726 50%, #081624 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '100px 0 112px',
      }}
    >
      {/* Seamless top divider bridge */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.22) 50%, transparent 95%)',
        }}
      />

      {/* Subtle coordinate mesh background */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(22, 140, 160, 0.07) 0%, transparent 60%),
            linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Seamless bottom divider bridge */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.2) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" ref={ref} style={{ position: 'relative', zIndex: 1, maxWidth: '1120px' }}>

        {/* Section Header */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 64px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '14px' }}>
            <span className="os-label" style={{ margin: 0, color: '#7ecad0' }}>
              OCEANOGRAPHIC PARAMETERS
            </span>
          </div>

          <h2
            className="os-heading"
            style={{
              color: '#ffffff',
              fontSize: 'clamp(2rem, 3.8vw, 3rem)',
              marginBottom: '18px',
            }}
          >
            Ten essential ocean variables.
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
            From sea surface temperature to deep-ocean pH, oceanStream provides
            a unified spatiotemporal representation across physical and biogeochemical domains.
          </p>
        </motion.div>

        {/* Domain Group 1: Physical Oceanography */}
        <div style={{ marginBottom: '56px' }}>
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.1 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              paddingBottom: '12px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <span
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontSize: '14.5px',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}
            >
              Physical Oceanography
            </span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#8da8b0',
                fontWeight: 600,
              }}
            >
              (4 Variables)
            </span>
          </motion.div>

          <div
            className="os-variables-editorial-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '20px',
            }}
          >
            {physicalVariables.map((v, i) => (
              <VariableCard key={v.id} item={v} index={i} inView={inView} shouldReduceMotion={shouldReduceMotion} />
            ))}
          </div>
        </div>

        {/* Domain Group 2: Biogeochemical Oceanography */}
        <div>
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.18 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              paddingBottom: '12px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <span
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontSize: '14.5px',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}
            >
              Biogeochemical Oceanography
            </span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#8da8b0',
                fontWeight: 600,
              }}
            >
              (6 Variables)
            </span>
          </motion.div>

          <div
            className="os-variables-editorial-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '20px',
            }}
          >
            {bgcVariables.map((v, i) => (
              <VariableCard key={v.id} item={v} index={i + 4} inView={inView} shouldReduceMotion={shouldReduceMotion} />
            ))}
          </div>
        </div>

      </div>

      <style>{`
        .os-editorial-var-card:hover {
          background: rgba(255, 255, 255, 0.045) !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
        }

        @media (max-width: 860px) {
          .os-variables-editorial-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .os-variables-section {
            padding: 64px 0 76px !important;
          }
        }

        @media (max-width: 480px) {
          .os-editorial-var-card {
            padding: 22px 20px 18px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .os-editorial-var-card {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
