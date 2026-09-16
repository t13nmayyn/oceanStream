import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Microscope,
  Fish,
  Globe,
  ShieldAlert,
  GraduationCap,
  Landmark,
} from 'lucide-react';

const useCases = [
  {
    title: 'Marine Research',
    color: '#168ca0',
    bg: 'rgba(22, 140, 160, 0.08)',
    border: 'rgba(22, 140, 160, 0.25)',
    icon: Microscope,
    desc: 'Oceanographers study thermoclines, haloclines, current shears, and biogeochemical cycles without waiting for NetCDF downloads.',
    examples: ['Thermocline analysis', 'Eddy tracking', 'Mixed layer depth'],
  },
  {
    title: 'Fisheries Management',
    color: '#2daa7a',
    bg: 'rgba(45, 170, 122, 0.08)',
    border: 'rgba(45, 170, 122, 0.25)',
    icon: Fish,
    desc: 'Monitor potential fishing zones, chlorophyll-a blooms, and sea surface temperature anomalies for sustainable fisheries planning.',
    examples: ['PFZ prediction', 'Upwelling zones', 'Chlorophyll mapping'],
  },
  {
    title: 'Climate Monitoring',
    color: '#5a6ab5',
    bg: 'rgba(90, 106, 181, 0.08)',
    border: 'rgba(90, 106, 181, 0.25)',
    icon: Globe,
    desc: 'Track long-term ocean heat content, sea level trends, and biogeochemical changes that indicate global climate signals.',
    examples: ['Ocean heat content', 'Ocean acidification', 'Carbon flux'],
  },
  {
    title: 'Disaster Management',
    color: '#e8545a',
    bg: 'rgba(232, 84, 90, 0.08)',
    border: 'rgba(232, 84, 90, 0.25)',
    icon: ShieldAlert,
    desc: 'Support cyclone track prediction, search-and-rescue drift simulation, and rapid sea level anomaly assessment for NDRF operations.',
    examples: ['Cyclone SST', 'Drift prediction', 'Surge monitoring'],
  },
  {
    title: 'Ocean Education',
    color: '#c08a2a',
    bg: 'rgba(192, 138, 42, 0.08)',
    border: 'rgba(192, 138, 42, 0.25)',
    icon: GraduationCap,
    desc: 'Students and educators explore real oceanographic data interactively — replacing textbook diagrams with live 4D ocean data.',
    examples: ['Interactive exploration', 'Variable comparison', 'Profile visualization'],
  },
  {
    title: 'Policy & Planning',
    color: '#168ca0',
    bg: 'rgba(22, 140, 160, 0.08)',
    border: 'rgba(22, 140, 160, 0.25)',
    icon: Landmark,
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
          background: 'linear-gradient(90deg, transparent 5%, rgba(22, 140, 160, 0.18) 50%, transparent 95%)',
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
          {useCases.map((uc) => {
            const Icon = uc.icon;
            return (
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
                  borderColor: uc.border,
                  transition: { duration: 0.2 },
                }}
              >
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: uc.bg,
                    border: `1px solid ${uc.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    color: uc.color,
                  }}
                >
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <h3
                  className="font-semibold mb-2"
                  style={{ color: '#172027', fontFamily: 'Manrope, sans-serif', fontSize: '16px' }}
                >
                  {uc.title}
                </h3>
                <p style={{ color: '#66777d', fontSize: '13px', lineHeight: 1.65, marginBottom: '16px' }}>{uc.desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {uc.examples.map((ex) => (
                    <span
                      key={ex}
                      style={{
                        fontSize: '10.5px',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#f1f6f5',
                        color: '#4e646b',
                        border: '1px solid #dbe6e4',
                      }}
                    >
                      {ex}
                    </span>
                  ))}
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
