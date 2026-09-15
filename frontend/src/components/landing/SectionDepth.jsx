import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const layers = [
  {
    name: 'Surface Layer',
    depth: '0 – 10 m',
    temp: '28 – 32 °C',
    accentColor: '#e8545a',
    borderColor: '#f0a0a4',
    desc: 'Sun-warmed epipelagic zone with SST variability driven by air-sea heat flux, evaporation and wind mixing. Primary driver of weather systems.',
    features: ['Sea Surface Temperature', 'Chlorophyll blooms', 'Wind mixing'],
  },
  {
    name: 'Mixed Layer',
    depth: '10 – 100 m',
    temp: '24 – 28 °C',
    accentColor: '#c08a2a',
    borderColor: '#e0c060',
    desc: 'Turbulently mixed zone of near-uniform temperature and salinity. Depth varies seasonally — shallow in summer, deep in winter monsoon.',
    features: ['Uniform temperature', 'Nutrient upwelling', 'Monsoon-driven mixing'],
  },
  {
    name: 'Thermocline',
    depth: '100 – 1000 m',
    temp: '8 – 24 °C',
    accentColor: '#5a6ab5',
    borderColor: '#9aa0d8',
    desc: 'Sharp temperature gradient acting as a physical barrier between warm surface and cold deep water. Critical for fisheries and submarine acoustics.',
    features: ['Temperature gradient', 'Acoustic ducting', 'Fisheries habitat'],
  },
  {
    name: 'Deep Ocean',
    depth: '1000 – 5500 m',
    temp: '0 – 4 °C',
    accentColor: '#168ca0',
    borderColor: '#7ecad0',
    desc: "Cold, high-pressure abyssal water masses formed by thermohaline circulation at polar regions. Stores 93% of Earth's heat and carbon.",
    features: ['Thermohaline circulation', 'Carbon sequestration', 'Extreme pressure'],
  },
];

const depthMarkers = ['0 m', '100 m', '500 m', '1000 m', '2000 m', '5500 m'];

export default function SectionDepth() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      className="landing-section"
      style={{ background: '#f4f6f5' }}
    >
      <div className="os-container" ref={ref}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: '52px', maxWidth: '600px' }}
        >
          <span className="os-label">Explore the Depth</span>
          <h2 className="os-heading" style={{ marginBottom: '16px' }}>
            From surface to abyss.
          </h2>
          <p className="os-body">
            The ocean has a vertical structure that fundamentally changes its physics,
            chemistry and biology. 2D maps miss 99% of this reality.
          </p>
        </motion.div>

        {/* Depth layers — vertical progression */}
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '32px', alignItems: 'start' }}
          className="depth-grid">
          {/* Left depth scale */}
          <div className="depth-scale-col">
            <motion.div
              initial={{ opacity: 0, scaleY: 0 }}
              animate={inView ? { opacity: 1, scaleY: 1 } : {}}
              transition={{ delay: 0.2, duration: 0.8, transformOrigin: 'top' }}
              style={{ position: 'relative', minHeight: '380px' }}
            >
              {/* Depth gradient bar */}
              <div
                style={{
                  position: 'absolute',
                  left: '28px',
                  top: 0,
                  bottom: 0,
                  width: '10px',
                  borderRadius: '999px',
                  background: 'linear-gradient(180deg, #e8545a 0%, #c08a2a 30%, #5a6ab5 60%, #168ca0 100%)',
                  opacity: 0.5,
                }}
              />
              {/* Markers */}
              {depthMarkers.map((d, i) => (
                <div
                  key={d}
                  style={{
                    position: 'absolute',
                    left: '48px',
                    top: `${i * 19}%`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div style={{ width: '10px', height: '1px', background: '#c8d4d2' }} />
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#8aa0a4' }}>
                    {d}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right layer cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {layers.map((layer, i) => (
              <motion.div
                key={layer.name}
                initial={{ opacity: 0, x: 24 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
                style={{
                  position: 'relative',
                  padding: '18px 20px 18px 24px',
                  borderRadius: '12px',
                  background: '#ffffff',
                  border: '1px solid #dce4e2',
                  borderLeft: `3px solid ${layer.accentColor}`,
                }}
                whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(22,40,44,0.07)', transition: { duration: 0.2 } }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <h3 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '15px', fontWeight: 600, color: '#172027', marginBottom: '3px' }}>
                      {layer.name}
                    </h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: layer.accentColor, fontWeight: 600 }}>
                        {layer.depth}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#8aa0a4' }}>
                        {layer.temp}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {layer.features.map((f) => (
                      <span
                        key={f}
                        style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: '#eef3f2',
                          border: '1px solid #d4dedc',
                          color: '#526870',
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: '12px', lineHeight: 1.65, color: '#7a9094' }}>{layer.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom note */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          style={{ marginTop: '36px', textAlign: 'center', fontSize: '13px', color: '#7a9094' }}
        >
          oceanStream provides full vertical profiling from{' '}
          <span style={{ color: '#168ca0', fontWeight: 600 }}>0 m</span> to{' '}
          <span style={{ color: '#5a6ab5', fontWeight: 600 }}>5500 m</span>{' '}
          through Argo floats and CMEMS model fields
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .depth-grid { grid-template-columns: 1fr !important; }
          .depth-scale-col { display: none; }
        }
      `}</style>
    </section>
  );
}
