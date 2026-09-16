import { useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';

const depthMilestones = [
  {
    id: 'surface',
    depthLabel: 'Surface',
    depthMetric: '0 m',
    title: 'Epipelagic Sunlight Layer',
    temp: '28 – 32 °C',
    light: '100% Sunlight',
    accentColor: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    desc: 'Sun-warmed epipelagic zone with SST variability driven by air-sea heat flux, evaporation and wind mixing. Primary driver of weather systems and marine primary productivity.',
    features: ['Sea Surface Temperature', 'Chlorophyll blooms', 'Wind mixing'],
  },
  {
    id: '50m',
    depthLabel: '50 m',
    depthMetric: '50 m',
    title: 'Turbulent Mixed Layer',
    temp: '24 – 28 °C',
    light: 'Euphotic Limit',
    accentColor: '#2dd4bf',
    glowColor: 'rgba(45, 212, 191, 0.25)',
    desc: 'Turbulently mixed layer of near-uniform temperature and salinity. Depth varies seasonally with monsoon wind regimes and upper-ocean mixing.',
    features: ['Uniform temperature', 'Nutrient upwelling', 'Monsoon mixing'],
  },
  {
    id: '200m',
    depthLabel: '200 m',
    depthMetric: '200 m',
    title: 'Main Thermocline',
    temp: '8 – 24 °C',
    light: 'Dysphotic Twilight',
    accentColor: '#818cf8',
    glowColor: 'rgba(129, 140, 248, 0.25)',
    desc: 'Sharp vertical temperature and density gradient acting as a physical barrier between warm surface and cold deep water. Critical for fisheries and acoustic ducting.',
    features: ['Temperature gradient', 'Acoustic ducting', 'Pycnocline barrier'],
  },
  {
    id: '1000m',
    depthLabel: '1,000 m',
    depthMetric: '1,000 m',
    title: 'Mesopelagic Twilight Zone',
    temp: '4 – 8 °C',
    light: 'Aphotic Boundary',
    accentColor: '#6366f1',
    glowColor: 'rgba(99, 102, 241, 0.25)',
    desc: 'Intermediate water mass transport layer where sunlight extinguishes. Hosts the primary Oxygen Minimum Zone (OMZ) and nutrient regeneration pathways.',
    features: ['Oxygen minimum zone', 'Intermediate water', 'Twilight limit'],
  },
  {
    id: 'abyss',
    depthLabel: 'Abyss',
    depthMetric: '5,500 m',
    title: 'Abyssal Plain & Floor',
    temp: '0 – 4 °C',
    light: 'Perpetual Darkness · 550+ atm',
    accentColor: '#0ea5e9',
    glowColor: 'rgba(14, 165, 233, 0.25)',
    desc: "Cold, high-pressure abyssal water masses formed by thermohaline circulation at polar regions. Stores over 90% of Earth's oceanic heat and carbon.",
    features: ['Thermohaline circulation', 'Carbon storage', 'Extreme pressure'],
  },
];

export default function SectionDepth() {
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, margin: '-60px' });
  const shouldReduceMotion = useReducedMotion();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <section
      ref={sectionRef}
      className="landing-section os-depth-journey-section"
      style={{
        background: 'linear-gradient(180deg, #081624 0%, #06121e 22%, #050e18 48%, #030811 75%, #02070e 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '100px 0 116px',
      }}
    >
      {/* Seamless top divider bridge */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(0, 200, 255, 0.2) 50%, transparent 95%)',
        }}
      />

      {/* Subtle coordinate mesh texture */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.05) 0%, transparent 60%),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.012) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Seamless bottom divider bridge */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(56, 189, 248, 0.2) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" style={{ position: 'relative', zIndex: 1, maxWidth: '960px' }}>

        {/* Section Header */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 64px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '14px' }}>
            <span className="os-label" style={{ margin: 0, color: '#7ecad0' }}>
              VERTICAL STRATIFICATION
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
            From surface to abyss.
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
            The ocean has a vertical structure that fundamentally changes its physics,
            chemistry and biology. 2D maps miss 99% of this reality.
          </p>
        </motion.div>

        {/* Pure Vertical Depth Journey Descent Flow */}
        <div className="os-depth-vertical-flow" style={{ position: 'relative' }}>

          {/* Continuous illuminated vertical descent spine line with scroll reveal */}
          <motion.div
            aria-hidden="true"
            className="os-descent-spine"
            initial={shouldReduceMotion ? { opacity: 0.45 } : { scaleY: 0, opacity: 0 }}
            whileInView={shouldReduceMotion ? { opacity: 0.45 } : { scaleY: 1, opacity: 0.55 }}
            viewport={{ once: true, margin: '-20px' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute',
              left: '140px',
              top: '24px',
              bottom: '24px',
              width: '2px',
              background: 'linear-gradient(180deg, #38bdf8 0%, #2dd4bf 25%, #818cf8 50%, #6366f1 75%, #0ea5e9 100%)',
              transformOrigin: 'top',
            }}
          />

          {/* Depth Milestone Stages */}
          {depthMilestones.map((milestone, idx) => {
            const isHovered = hoveredIdx === idx;
            const isLast = idx === depthMilestones.length - 1;

            return (
              <div key={milestone.id} style={{ position: 'relative' }}>
                <motion.div
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
                  whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.42, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="os-depth-stage-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 48px 1fr',
                    alignItems: 'flex-start',
                    padding: '24px 0',
                    transition: 'opacity 0.25s ease',
                    cursor: 'default',
                  }}
                >
                  {/* Left Column: Prominent Depth Milestone */}
                  <div style={{ textAlign: 'right', paddingRight: '16px', paddingTop: '2px' }}>
                    <div
                      style={{
                        fontFamily: 'Manrope, sans-serif',
                        fontSize: '22px',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: isHovered ? milestone.accentColor : '#ffffff',
                        lineHeight: 1.15,
                        transition: 'color 0.2s ease',
                      }}
                    >
                      {milestone.depthLabel}
                    </div>

                    <div
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#9bb7bf',
                        marginTop: '3px',
                      }}
                    >
                      {milestone.depthMetric}
                    </div>
                  </div>

                  {/* Center Column: Interactive Spine Node */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingTop: '6px',
                    }}
                  >
                    <motion.div
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
                      whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                      viewport={{ once: true, margin: '-30px' }}
                      transition={{ duration: 0.35, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        width: isHovered ? '16px' : '12px',
                        height: isHovered ? '16px' : '12px',
                        borderRadius: '50%',
                        background: milestone.accentColor,
                        boxShadow: isHovered
                          ? `0 0 16px ${milestone.accentColor}, 0 0 32px ${milestone.glowColor}`
                          : `0 0 8px ${milestone.glowColor}`,
                        border: '2px solid #061120',
                        transition: 'width 0.2s ease, height 0.2s ease, box-shadow 0.25s ease, background 0.25s ease',
                        zIndex: 2,
                      }}
                    />
                  </div>

                  {/* Right Column: Clean Editorial Content (NO boxed chassis) */}
                  <div style={{ paddingLeft: '16px' }}>
                    {/* Layer Title & Telemetry Specs */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <h3
                        style={{
                          fontFamily: 'Manrope, sans-serif',
                          fontSize: '19px',
                          fontWeight: 700,
                          color: '#ffffff',
                          margin: 0,
                          letterSpacing: '-0.015em',
                        }}
                      >
                        {milestone.title}
                      </h3>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '11.5px',
                        }}
                      >
                        <span style={{ color: milestone.accentColor, fontWeight: 700 }}>
                          {milestone.temp}
                        </span>
                        <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>·</span>
                        <span style={{ color: '#b2d0d7', fontWeight: 500 }}>
                          {milestone.light}
                        </span>
                      </div>
                    </div>

                    {/* Factual Description */}
                    <p
                      style={{
                        fontSize: '13.5px',
                        lineHeight: 1.65,
                        color: '#d6e7eb',
                        margin: '0 0 12px 0',
                        maxWidth: '680px',
                      }}
                    >
                      {milestone.desc}
                    </p>

                    {/* Subtle Feature Pills */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {milestone.features.map((feat) => (
                        <span
                          key={feat}
                          style={{
                            fontSize: '11px',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 500,
                            padding: '3px 9px',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: '#d1e5eb',
                            border: '1px solid rgba(255, 255, 255, 0.09)',
                            display: 'inline-block',
                            cursor: 'default',
                            transition: 'border-color 0.2s ease, background 0.2s ease',
                          }}
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Downward Directional Flow Connector between steps */}
                {!isLast && (
                  <motion.div
                    aria-hidden="true"
                    initial={shouldReduceMotion ? { opacity: 0.6 } : { opacity: 0, y: -2 }}
                    whileInView={shouldReduceMotion ? { opacity: 0.6 } : { opacity: 0.7, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: idx * 0.05 }}
                    className="os-descent-arrow-container"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 48px 1fr',
                      alignItems: 'center',
                      height: '24px',
                    }}
                  >
                    <div />
                    <div style={{ display: 'flex', justifyContent: 'center', color: milestone.accentColor, opacity: 0.7 }}>
                      <ArrowDown size={14} />
                    </div>
                    <div />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* Serene Editorial Profiling Bridge */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.38, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          style={{
            marginTop: '56px',
            paddingTop: '28px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            textAlign: 'center',
            fontSize: '14px',
            color: '#b8d2d8',
            lineHeight: 1.6,
          }}
        >
          <span>oceanStream provides continuous vertical profiling from </span>
          <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>0 m</span>
          <span> to </span>
          <span style={{ color: '#0ea5e9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>5,500 m</span>
          <span> through autonomous Argo floats and assimilated CMEMS numerical models.</span>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .os-depth-journey-section {
            padding: 64px 0 76px !important;
          }
          .os-descent-spine {
            left: 20px !important;
          }
          .os-depth-stage-row,
          .os-descent-arrow-container {
            grid-template-columns: 40px 1fr !important;
          }
          .os-depth-stage-row > div:first-child {
            display: none !important;
          }
          .os-descent-arrow-container > div:first-child {
            display: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .os-depth-stage-row,
          .os-descent-spine {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
