import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const tiers = [
  {
    id: 'l1',
    label: 'L1 Cache',
    sub: 'RAM Memory',
    latency: '< 1 ms',
    color: '#00e08c',
    desc: 'In-process Python dictionary cache. Sub-millisecond retrieval for repeated point queries and spatial cross-sections.',
    tech: 'Hash dict · 300s TTL · ~256 MB',
  },
  {
    id: 'l2',
    label: 'L2 Cache',
    sub: 'Zarr on Disk',
    latency: '5 – 25 ms',
    color: '#f5a623',
    desc: 'Chunked multidimensional Zarr stores for physics, BGC, and Argo data organized by 4° spatial × 1-day temporal tiles.',
    tech: 'Zarr Array Storage · 4GB cap',
  },
  {
    id: 'l3',
    label: 'L3 Origin',
    sub: 'Copernicus / Argo APIs',
    latency: '15 – 90 s',
    color: '#7b5af5',
    desc: 'Non-blocking asynchronous background fetch from Copernicus Marine API and Argo ERDDAP servers. Never freezes the client UI.',
    tech: 'copernicusmarine · argopy · asyncio',
  },
];

export default function SectionDataEngine() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      className="landing-section os-section-dark"
      style={{
        background: 'linear-gradient(180deg, #091320 0%, #0d1a29 50%, #091320 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '76px 0 84px',
      }}
    >
      {/* Seamless top divider bridge */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.25) 50%, transparent 95%)',
        }}
      />

      {/* Seamless bottom divider bridge */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(22, 140, 160, 0.18) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" ref={ref}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 52px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
            <span
              className="os-label"
              style={{
                margin: 0,
                color: '#7ecad0',
              }}
            >
              INTELLIGENT DATA ENGINE
            </span>
          </div>

          <h2
            className="os-heading"
            style={{
              color: '#ffffff',
              marginBottom: '16px',
            }}
          >
            Ocean data at sub-millisecond speed.
          </h2>

          <p
            className="os-body"
            style={{
              maxWidth: '560px',
              margin: '0 auto',
              color: 'rgba(190, 210, 208, 0.8)',
            }}
          >
            A 3-tier caching architecture inspired by operating system virtual memory.
            Query the ocean interactively without waiting for slow remote satellite downloads.
          </p>
        </motion.div>

        {/* 3 Cache Tiers Grid */}
        <div
          className="grid md:grid-cols-3 gap-4 mb-10"
        >
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.5 }}
              className="relative p-6 rounded-2xl overflow-hidden flex flex-col justify-between"
              style={{
                background: 'rgba(255, 255, 255, 0.035)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: `3px solid ${tier.color}`,
              }}
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div
                      className="text-[10.5px] font-mono font-bold tracking-wider mb-1"
                      style={{ color: tier.color }}
                    >
                      {tier.label.toUpperCase()}
                    </div>
                    <div style={{ color: 'rgba(190, 210, 208, 0.65)', fontSize: '12px' }}>
                      {tier.sub}
                    </div>
                  </div>
                  <div
                    className="text-2xl font-bold font-mono"
                    style={{ color: tier.color }}
                  >
                    {tier.latency}
                  </div>
                </div>

                <p
                  style={{
                    color: 'rgba(190, 210, 208, 0.78)',
                    fontSize: '13px',
                    lineHeight: 1.65,
                    marginBottom: '16px',
                  }}
                >
                  {tier.desc}
                </p>
              </div>

              <div
                className="text-[10.5px] font-mono pt-3"
                style={{
                  color: 'rgba(190, 210, 208, 0.5)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                {tier.tech}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Demand Paging Architecture Summary */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="rounded-2xl p-6 text-center"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          <div
            style={{
              fontFamily: 'Manrope, sans-serif',
              fontSize: '16px',
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: '6px',
            }}
          >
            4D Virtual Memory Page Table
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'rgba(190, 210, 208, 0.75)',
              lineHeight: 1.6,
              maxWidth: '620px',
              margin: '0 auto',
            }}
          >
            Spatiotemporal bounding boxes are indexed as discrete coordinate pages. Requests hit fast in-memory L1/L2 pages immediately, while un-cached regions stream asynchronously in the background.
          </p>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .os-section-dark {
            padding: 64px 0 76px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .os-section-dark * {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
