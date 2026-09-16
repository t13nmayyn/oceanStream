import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ExternalLink } from 'lucide-react';

const datasets = [
  {
    name: 'CMEMS Physics (ANFC)',
    id: 'GLOBAL_ANALYSISFORECAST_PHY_001_024',
    type: 'Gridded Model',
    variables: 'Temperature, Salinity, Currents (U/V), Sea Level (ZOS)',
    coverage: 'Near-real-time to +10 day forecast',
    role: 'Primary physics layer for recent ocean states and forecasts',
    url: 'https://marine.copernicus.eu',
    color: '#00c8ff',
  },
  {
    name: 'CMEMS Physics (GLORYS12)',
    id: 'GLOBAL_MULTIYEAR_PHY_001_030',
    type: 'Reanalysis Model',
    variables: 'Temperature, Salinity, Currents, Sea Level',
    coverage: '1993 – present (historical, >400 days old)',
    role: 'Historical multi-year reanalysis for climate and trend analysis',
    url: 'https://marine.copernicus.eu',
    color: '#00c8ff',
  },
  {
    name: 'CMEMS BGC (ANFC)',
    id: 'GLOBAL_ANALYSISFORECAST_BGC_001_028',
    type: 'Gridded BGC Model',
    variables: 'Chlorophyll, Nitrate, Phosphate, Silicate, Oxygen, pH, pCO₂',
    coverage: 'Near-real-time to +10 day forecast',
    role: 'Biogeochemical variables for ecosystem and carbon cycle analysis',
    url: 'https://marine.copernicus.eu',
    color: '#00e08c',
  },
  {
    name: 'CMEMS BGC (Multi-Year)',
    id: 'GLOBAL_MULTIYEAR_BGC_001_029',
    type: 'Reanalysis BGC Model',
    variables: 'Chlorophyll, Nitrate, Phosphate, Oxygen, pH, pCO₂',
    coverage: '1993 – present (historical)',
    role: 'Historical biogeochemical reanalysis for long-term trend studies',
    url: 'https://marine.copernicus.eu',
    color: '#00e08c',
  },
  {
    name: 'Core Argo',
    id: 'Argo (argopy, standard mode)',
    type: 'In-Situ Float',
    variables: 'Temperature, Salinity (CTD profiles)',
    coverage: '2000 – present, global, ~4000 active floats',
    role: 'Ground-truth T/S profiles for model validation to 2000m depth',
    url: 'https://argo.ucsd.edu',
    color: '#7b5af5',
  },
  {
    name: 'BGC-Argo',
    id: 'Argo (argopy, expert mode)',
    type: 'In-Situ Float',
    variables: 'Oxygen, Chlorophyll, Nitrate, pH, pCO₂, Irradiance',
    coverage: '2012 – present, ~1000+ active BGC floats',
    role: 'In-situ biogeochemical observations for ecosystem monitoring',
    url: 'https://biogeochemical-argo.org',
    color: '#7b5af5',
  },
  {
    name: 'AODN / IMOS CTD',
    id: 'IMOS (aodn_output/*.nc)',
    type: 'Mooring / CTD',
    variables: 'Temperature, Salinity, Depth (high-frequency)',
    coverage: 'Site-specific timeseries (e.g., Coral Sea PIL100)',
    role: 'High-frequency coastal mooring data for near-shore validation',
    url: 'https://aodn.org.au',
    color: '#f5a623',
  },
];

export default function SectionDatasets() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="landing-section"
      style={{
        background: 'linear-gradient(180deg, #f4f6f5 0%, #edf3f1 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '76px 0 84px',
      }}
    >
      {/* Seamless top divider bridge */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(22, 140, 160, 0.12) 50%, transparent 95%)',
        }}
      />

      {/* Seamless bottom divider bridge */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.28) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="os-label">Data Sources</span>
          <h2 className="os-heading" style={{ marginBottom: '12px' }}>Dataset Sources</h2>
          <p className="os-body" style={{ maxWidth: '500px', margin: '0 auto' }}>
            All data integrated by oceanStream — with transparent routing between
            near-real-time and historical products.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="overflow-hidden rounded-2xl"
          style={{ border: '1px solid #dce4e2' }}
        >
          <div className="overflow-x-auto" style={{ background: '#ffffff' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ background: '#f4f8f7', borderBottom: '1px solid #dce4e2' }}>
                  {['Dataset / Source', 'Data Type', 'Variables', 'Temporal Coverage', 'Role in oceanStream', 'Official Source'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3.5 whitespace-nowrap"
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#687e84' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datasets.map((ds, i) => (
                  <motion.tr
                    key={ds.id}
                    initial={{ opacity: 0 }}
                    animate={inView ? { opacity: 1 } : {}}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    style={{ borderBottom: '1px solid #edf2f1', background: i % 2 === 0 ? '#ffffff' : '#f8faf9' }}
                    className="group"
                  >
                    <td className="px-4 py-3">
                      <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 600, fontSize: '13px', color: '#172027', marginBottom: '2px' }}>
                        {ds.name}
                      </div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#9aacb0' }}>
                        {ds.id}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: '#e5f3f4', color: '#168ca0', border: '1px solid #b2d8dc' }}
                      >
                        {ds.type}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: '12px', color: '#566870', maxWidth: '180px' }}>{ds.variables}</td>
                    <td className="px-4 py-3" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#7a9094', whiteSpace: 'nowrap' }}>{ds.coverage}</td>
                    <td className="px-4 py-3" style={{ fontSize: '12px', color: '#566870', maxWidth: '200px', lineHeight: 1.5 }}>{ds.role}</td>
                    <td className="px-4 py-3">
                      <a
                        href={ds.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
                        style={{ color: '#168ca0' }}
                      >
                        Visit
                        <ExternalLink size={10} />
                      </a>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .landing-section {
            padding: 64px 0 76px !important;
          }
        }
      `}</style>
    </section>
  );
}
