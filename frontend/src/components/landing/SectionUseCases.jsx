import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const useCases = [
  {
    title: 'Marine Research',
    color: '#00c8ff',
    icon: '🔬',
    desc: 'Oceanographers study thermoclines, haloclines, current shears, and biogeochemical cycles without waiting for NetCDF downloads.',
    examples: ['Thermocline analysis', 'Eddy tracking', 'Mixed layer depth'],
  },
  {
    title: 'Fisheries Management',
    color: '#00e08c',
    icon: '🐟',
    desc: 'Monitor potential fishing zones, chlorophyll-a blooms, and sea surface temperature anomalies for sustainable fisheries planning.',
    examples: ['PFZ prediction', 'Upwelling zones', 'Chlorophyll mapping'],
  },
  {
    title: 'Climate Monitoring',
    color: '#7b5af5',
    icon: '🌍',
    desc: 'Track long-term ocean heat content, sea level trends, and biogeochemical changes that indicate global climate signals.',
    examples: ['Ocean heat content', 'Ocean acidification', 'Carbon flux'],
  },
  {
    title: 'Disaster Management',
    color: '#f54375',
    icon: '🚨',
    desc: 'Support cyclone track prediction, search-and-rescue drift simulation, and rapid sea level anomaly assessment for NDRF operations.',
    examples: ['Cyclone SST', 'Drift prediction', 'Surge monitoring'],
  },
  {
    title: 'Ocean Education',
    color: '#f5a623',
    icon: '📚',
    desc: 'Students and educators explore real oceanographic data interactively — replacing textbook diagrams with live 4D ocean data.',
    examples: ['Interactive exploration', 'Variable comparison', 'Profile visualization'],
  },
  {
    title: 'Policy & Planning',
    color: '#00c8ff',
    icon: '🏛️',
    desc: 'Policymakers access ocean intelligence for maritime zone management, coastal infrastructure decisions, and MPA planning.',
    examples: ['EEZ monitoring', 'Coastal protection', 'MPA planning'],
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: 'easeOut' } },
};

export default function SectionUseCases() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="landing-section"
      style={{ background: '#f4f6f5' }}
    >
      <div className="os-container" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="os-label">Use Cases</span>
          <h2 className="os-heading" style={{ marginBottom: '8px' }}>Built for the entire ocean community.</h2>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {useCases.map((uc) => (
            <motion.article
              key={uc.title}
              variants={cardVariants}
              className="group p-6 rounded-2xl"
              style={{
                background: '#ffffff',
                border: '1px solid #dce4e2',
              }}
              whileHover={{
                y: -4,
                boxShadow: '0 16px 40px rgba(22,40,44,0.08)',
                transition: { duration: 0.2 },
              }}
            >
              <div className="text-2xl mb-4" role="img" aria-label={uc.title}>{uc.icon}</div>
              <h3
                className="font-semibold mb-2"
                style={{ color: '#172027', fontFamily: 'Manrope, sans-serif', fontSize: '16px' }}
              >
                {uc.title}
              </h3>
              <p style={{ color: '#7a9094', fontSize: '13px', lineHeight: 1.65, marginBottom: '14px' }}>{uc.desc}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {uc.examples.map((ex) => (
                  <span
                    key={ex}
                    style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: '#eef3f2',
                      color: '#526870',
                      border: '1px solid #d4dedc',
                    }}
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
