import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const acronyms = [
  { acronym: 'INCOIS', full: 'Indian National Centre for Ocean Information Services', purpose: 'Nodal agency for oceanographic data services in India; primary stakeholder' },
  { acronym: 'MoES', full: 'Ministry of Earth Sciences', purpose: 'Indian government ministry overseeing earth and ocean sciences' },
  { acronym: 'CMEMS', full: 'Copernicus Marine Environment Monitoring Service', purpose: 'EU ocean monitoring service providing global ocean model products and reanalysis' },
  { acronym: 'EEZ', full: 'Exclusive Economic Zone', purpose: '200 nautical mile zone where India has sovereign rights over marine resources' },
  { acronym: 'Argo', full: 'Array for Real-time Geostrophic Oceanography', purpose: 'Global array of autonomous profiling floats measuring T/S from surface to 2000m' },
  { acronym: 'BGC', full: 'Biogeochemical (BGC-Argo)', purpose: 'Enhanced Argo floats with sensors for oxygen, chlorophyll, nitrate, pH, pCO₂' },
  { acronym: 'CTD', full: 'Conductivity–Temperature–Depth', purpose: 'Standard oceanographic instrument measuring salinity, temperature, and pressure' },
  { acronym: 'AODN', full: 'Australian Ocean Data Network', purpose: 'Open-access repository for Australian marine and climate observation data' },
  { acronym: 'SST', full: 'Sea Surface Temperature', purpose: 'Temperature of the uppermost ocean layer; key variable for weather, climate, fisheries' },
  { acronym: 'GLORYS12', full: 'Global Ocean Reanalysis 12th scale', purpose: 'CMEMS multi-year reanalysis product at 1/12° resolution for historical ocean states' },
  { acronym: 'NetCDF', full: 'Network Common Data Form', purpose: 'Self-describing binary format for multidimensional scientific data (e.g., ocean model output)' },
  { acronym: 'Zarr', full: 'Zarr Array Storage', purpose: 'Cloud-native chunked array storage format used as L2 cache in oceanStream' },
  { acronym: 'ERDDAP', full: 'Environmental Research Division Data Access Program', purpose: 'NOAA data server providing standardized access to oceanographic observational data' },
  { acronym: 'ANFC', full: 'Analysis and Near-Real-Time Forecast (CMEMS product)', purpose: 'Recent-vintage CMEMS dataset covering near-real-time to 10-day forecast window' },
];

export default function SectionAcronyms() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="landing-section"
      style={{
        background: 'linear-gradient(180deg, #edf3f1 0%, #f7faf9 50%, #ffffff 100%)',
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
          background: 'linear-gradient(90deg, transparent 5%, rgba(22, 140, 160, 0.12) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="os-label">Reference</span>
          <h2 className="os-heading" style={{ marginBottom: '12px' }}>Oceanographic Acronyms</h2>
          <p className="os-body" style={{ maxWidth: '480px', margin: '0 auto' }}>
            Key terminology used in ocean science and oceanStream's technical documentation.
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
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: '640px' }}>
              <thead>
                <tr style={{ background: '#f4f8f7', borderBottom: '1px solid #dce4e2' }}>
                  <th className="text-left px-5 py-3.5" style={{ width: '120px', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#687e84' }}>
                    Acronym
                  </th>
                  <th className="text-left px-5 py-3.5" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#687e84' }}>
                    Full Form
                  </th>
                  <th className="text-left px-5 py-3.5" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#687e84' }}>
                    Purpose / Relevance
                  </th>
                </tr>
              </thead>
              <tbody>
                {acronyms.map((row, i) => (
                  <motion.tr
                    key={row.acronym}
                    initial={{ opacity: 0, x: -10 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.3 + i * 0.03, duration: 0.35 }}
                    style={{ borderBottom: '1px solid #edf2f1', background: i % 2 === 0 ? '#ffffff' : '#f8faf9' }}
                    className="group"
                  >
                    <td className="px-5 py-3">
                      <span
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: '#e5f3f4', color: '#168ca0', border: '1px solid #b2d8dc' }}
                      >
                        {row.acronym}
                      </span>
                    </td>
                    <td className="px-5 py-3" style={{ fontSize: '13px', color: '#172027' }}>{row.full}</td>
                    <td className="px-5 py-3" style={{ fontSize: '13px', color: '#7a9094', lineHeight: 1.55 }}>{row.purpose}</td>
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
