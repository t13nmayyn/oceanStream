import { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const tiers = [
  {
    id: 'l1',
    label: 'L1 Cache',
    sub: 'RAM Memory',
    latency: '< 1 ms',
    color: '#00e08c',
    icon: '⚡',
    desc: 'In-process Python dictionary cache. Sub-millisecond retrieval for repeated point and snapshot queries.',
    tech: 'Hash dict · 300s TTL · ~256 MB',
  },
  {
    id: 'l2',
    label: 'L2 Cache',
    sub: 'Zarr on Disk',
    latency: '5 – 25 ms',
    color: '#f5a623',
    icon: '💾',
    desc: 'Chunked multidimensional Zarr stores for physics, BGC, and Argo data. Organized by 4° spatial × 1-day temporal pages.',
    tech: 'phy_data.zarr · bgc_data.zarr · argo_data.zarr · 4GB cap',
  },
  {
    id: 'l3',
    label: 'L3 Origin',
    sub: 'Copernicus / Argo APIs',
    latency: '15 – 90 s',
    color: '#7b5af5',
    icon: '🌐',
    desc: 'Non-blocking asynchronous background fetch from Copernicus Marine API and Argo ERDDAP servers. Never freezes the UI.',
    tech: 'copernicusmarine · argopy · asyncio · erddapy',
  },
];

const pageTableStates = [
  { label: 'RESIDENT', color: '#00e08c', count: 8, desc: 'Pages loaded into L1 RAM' },
  { label: 'ON_DISK', color: '#f5a623', count: 14, desc: 'Pages stored in L2 Zarr' },
  { label: 'FETCHING', color: '#f5a623', count: 3, desc: 'Background download in progress' },
  { label: 'NOT_FETCHED', color: '#121b2d', count: 25, desc: 'Pages not yet requested' },
];

export default function SectionDataEngine() {
  const [techOpen, setTechOpen] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

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
          className="text-center mb-16"
        >
          <span
            className="inline-block text-[11px] font-semibold tracking-[0.18em] uppercase mb-4"
            style={{ color: 'rgba(0, 200, 255, 0.75)' }}
          >
            Intelligent Data Engine
          </span>
          <h2
            className="font-display text-white mb-5"
            style={{
              fontFamily: 'Outfit, Inter, sans-serif',
              fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            Ocean data at sub-millisecond speed.
          </h2>
          <p className="text-muted mx-auto" style={{ maxWidth: '520px', lineHeight: 1.7 }}>
            A 3-tier caching architecture inspired by operating system virtual memory.
            Query the ocean without waiting for slow satellite downloads.
          </p>
        </motion.div>

        {/* Cache tiers */}
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.5 }}
              className="relative p-6 rounded-2xl overflow-hidden"
              style={{
                background: `rgba(13, 21, 37, 0.7)`,
                border: `1px solid ${tier.color}30`,
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: tier.color }}
              />

              <div className="flex items-start justify-between mb-4">
                <div>
                  <div
                    className="text-[10px] font-mono font-bold tracking-widest mb-1"
                    style={{ color: tier.color + 'aa' }}
                  >
                    {tier.label}
                  </div>
                  <div className="text-muted text-[12px]">{tier.sub}</div>
                </div>
                <div
                  className="text-2xl font-bold font-mono"
                  style={{ color: tier.color }}
                >
                  {tier.latency}
                </div>
              </div>

              <p className="text-muted text-[13px] mb-4 leading-relaxed">{tier.desc}</p>

              <div
                className="text-[10px] font-mono px-2 py-1.5 rounded"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: 'rgba(107, 131, 166, 0.7)',
                  border: '1px solid rgba(30, 48, 85, 0.5)',
                }}
              >
                {tier.tech}
              </div>

              {/* Connection arrow (not last) */}
              {i < tiers.length - 1 && (
                <div
                  className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 text-muted text-sm z-10"
                  style={{ fontSize: '10px', color: 'rgba(107, 131, 166, 0.4)' }}
                >
                  ↓ miss
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Page table visual */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="rounded-2xl p-6 mb-6"
          style={{
            background: 'rgba(13, 21, 37, 0.6)',
            border: '1px solid rgba(30, 48, 85, 0.6)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-semibold text-[14px]">4D Virtual Memory Page Table</div>
              <div className="text-muted text-[12px] mt-0.5">
                Lat × Lon × Depth × Time — OS-style demand paging
              </div>
            </div>
            <div className="flex gap-3">
              {pageTableStates.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-sm"
                    style={{
                      background: s.color,
                      border: s.color === '#121b2d' ? '1px solid #1e3055' : 'none',
                    }}
                  />
                  <span className="text-[10px] font-mono text-muted hidden lg:block">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mini memory grid */}
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: 'repeat(50, 1fr)' }}
          >
            {Array.from({ length: 50 }).map((_, i) => {
              let color = '#121b2d';
              let border = '1px solid #1e3055';
              let shadow = 'none';
              if (i < 8) { color = '#00e08c'; shadow = '0 0 3px #00e08c80'; border = 'none'; }
              else if (i < 22) { color = '#ff7700'; border = 'none'; }
              else if (i < 25) { color = '#f5a623'; border = 'none'; }
              return (
                <div
                  key={i}
                  className="rounded-sm"
                  style={{ height: '10px', background: color, boxShadow: shadow, border }}
                  title={
                    i < 8 ? 'RESIDENT (L1)' :
                    i < 22 ? 'ON_DISK (L2)' :
                    i < 25 ? 'FETCHING' : 'NOT_FETCHED'
                  }
                />
              );
            })}
          </div>

          <div className="mt-3 text-[11px] font-mono text-muted">
            8 pages resident · 14 on disk · 3 fetching · 25 not fetched
          </div>
        </motion.div>

        {/* Technical details toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.7 }}
        >
          <button
            onClick={() => setTechOpen(!techOpen)}
            className="flex items-center gap-2 text-[13px] text-muted hover:text-accent transition-colors cursor-pointer mb-3"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${techOpen ? 'rotate-180' : ''}`}
            />
            Technical Details
          </button>

          <AnimatePresence>
            {techOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-xl p-5 font-mono text-[12px]"
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(30, 48, 85, 0.5)',
                    color: 'rgba(107, 131, 166, 0.8)',
                  }}
                >
                  <div className="mb-2 text-[10px] tracking-widest" style={{ color: 'rgba(0, 200, 255, 0.6)' }}>
                    BUCKET DIMENSIONS
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><div style={{ color: '#00c8ff' }}>Latitude</div><div>4.0° bins (~444 km)</div></div>
                    <div><div style={{ color: '#7b5af5' }}>Longitude</div><div>4.0° bins (~444 km)</div></div>
                    <div><div style={{ color: '#00e08c' }}>Depth</div><div>2.0m vertical slices</div></div>
                    <div><div style={{ color: '#f5a623' }}>Time</div><div>1-day temporal bins</div></div>
                  </div>
                  <div className="mt-4 mb-2 text-[10px] tracking-widest" style={{ color: 'rgba(0, 200, 255, 0.6)' }}>
                    STATE MACHINE
                  </div>
                  <div style={{ color: 'rgba(212, 227, 247, 0.7)' }}>
                    NOT_FETCHED → FETCHING → ON_DISK → RESIDENT
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
