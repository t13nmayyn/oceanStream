import { useState, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

const oceanProfiles = [
  {
    id: 'bob',
    name: 'Bay of Bengal — Upper Thermocline',
    tag: 'Bay of Bengal',
    lat: '14.5200° N',
    latVal: '+14.52°',
    lon: '87.4100° E',
    lonVal: '+87.41°',
    depth: '250 m',
    depthVal: '-250 m',
    depthOffset: 65,
    time: '2026-09-16 12:00 UTC',
    timeRel: 'T+0h (Nowcast)',
    temp: '24.1 °C',
    salinity: '34.62 PSU',
    current: '0.48 m/s',
    source: 'CMEMS GLOBAL_ANALYSIS_FORECAST_PHY_001_024',
    voxelId: 'VOX-INCOIS-08842',
    zone: 'Upper Thermocline',
    coordX: 360,
    coordY: 114,
  },
  {
    id: 'as',
    name: 'Arabian Sea — Upwelling Zone',
    tag: 'Arabian Sea',
    lat: '18.1500° N',
    latVal: '+18.15°',
    lon: '65.3000° E',
    lonVal: '+65.30°',
    depth: '45 m',
    depthVal: '-45 m',
    depthOffset: 25,
    time: '2026-09-16 06:00 UTC',
    timeRel: 'T-6h (Argo Ingest)',
    temp: '27.8 °C',
    salinity: '36.45 PSU',
    current: '0.72 m/s',
    source: 'INCOIS Ocean State Forecast + Argo #2902189',
    voxelId: 'VOX-INCOIS-04219',
    zone: 'Epipelagic Layer',
    coordX: 310,
    coordY: 96,
  },
  {
    id: 'eq',
    name: 'Equatorial Indian Ocean — Undercurrent',
    tag: 'Equatorial Current',
    lat: '0.0000° N',
    latVal: '0.00°',
    lon: '78.5000° E',
    lonVal: '+78.50°',
    depth: '120 m',
    depthVal: '-120 m',
    depthOffset: 45,
    time: '2026-09-17 00:00 UTC',
    timeRel: 'T+12h (Forecast)',
    temp: '22.3 °C',
    salinity: '35.10 PSU',
    current: '0.94 m/s',
    source: 'CMEMS 10-Day Prognostic Ensemble',
    voxelId: 'VOX-INCOIS-10923',
    zone: 'Subsurface Jet',
    coordX: 375,
    coordY: 132,
  },
  {
    id: 'so',
    name: 'Southern Indian Ocean — Abyssal Plain',
    tag: 'Southern Ocean',
    lat: '42.3000° S',
    latVal: '-42.30°',
    lon: '90.1500° E',
    lonVal: '+90.15°',
    depth: '3,800 m',
    depthVal: '-3,800 m',
    depthOffset: 105,
    time: '2026-09-15 00:00 UTC',
    timeRel: 'T-36h (Reanalysis)',
    temp: '1.4 °C',
    salinity: '34.71 PSU',
    current: '0.06 m/s',
    source: 'Deep Argo #5906421 + GLORYS12V1',
    voxelId: 'VOX-INCOIS-77401',
    zone: 'Abyssal Water',
    coordX: 410,
    coordY: 145,
  },
];

const dims = [
  {
    id: 'lat',
    index: '01',
    symbol: 'φ',
    axisName: 'Latitude (φ)',
    mathDomain: 'Horizontal Y-Axis',
    label: 'Latitude',
    unit: '°N / °S',
    color: '#168ca0',
    lightBg: 'rgba(22, 140, 160, 0.06)',
    borderColor: '#9ed6de',
    glowColor: 'rgba(22, 140, 160, 0.18)',
    desc: 'North–South geographic coordinate across the ocean surface and stratified sub-surface layers.',
    rangeText: '-90.00° to +90.00°',
  },
  {
    id: 'lon',
    index: '02',
    symbol: 'λ',
    axisName: 'Longitude (λ)',
    mathDomain: 'Horizontal X-Axis',
    label: 'Longitude',
    unit: '°E / °W',
    color: '#5a6ab5',
    lightBg: 'rgba(90, 106, 181, 0.06)',
    borderColor: '#bac1e8',
    glowColor: 'rgba(90, 106, 181, 0.18)',
    desc: 'East–West geographic position spanning ocean basins, marginal seas, and regional currents.',
    rangeText: '-180.00° to +180.00°',
  },
  {
    id: 'depth',
    index: '03',
    symbol: 'z',
    axisName: 'Depth (z)',
    mathDomain: 'Vertical Z-Axis',
    label: 'Depth',
    unit: 'metres',
    color: '#2daa7a',
    lightBg: 'rgba(45, 170, 122, 0.06)',
    borderColor: '#9fd5bc',
    glowColor: 'rgba(45, 170, 122, 0.18)',
    desc: 'Vertical water column from the sunlit surface (0 m) down to abyssal plains (> 5,000 m).',
    rangeText: '0 m to 5,500+ m',
  },
  {
    id: 'time',
    index: '04',
    symbol: 't',
    axisName: 'Time (t)',
    mathDomain: 'Temporal T-Axis',
    label: 'Time',
    unit: 'UTC Timestamp',
    color: '#c08a2a',
    lightBg: 'rgba(192, 138, 42, 0.06)',
    borderColor: '#e5cca0',
    glowColor: 'rgba(192, 138, 42, 0.18)',
    desc: 'Temporal continuum — from multi-year historical reanalysis to 10-day prognostic forecasts.',
    rangeText: 'Reanalysis → Nowcast → +10d',
  },
];

const stats = [
  { value: '~400', label: 'daily CMEMS model releases', color: '#168ca0' },
  { value: '4,000+', label: 'active Argo floats globally', color: '#5a6ab5' },
  { value: '5,500 m', label: 'max profiling depth', color: '#2daa7a' },
];

export default function SectionChallenge() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const shouldReduceMotion = useReducedMotion();
  const [hoveredDim, setHoveredDim] = useState(null);

  const activeProfile = oceanProfiles[0];
  const px = activeProfile.coordX;
  const py = activeProfile.coordY;
  const depthY = py + activeProfile.depthOffset;

  return (
    <section
      className="landing-section os-4d-challenge-section"
      style={{
        background: 'linear-gradient(180deg, #f4f6f5 0%, #edf3f1 65%, #e7efed 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '96px 0 108px',
      }}
    >
      {/* Subtle scientific coordinate background pattern */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(22, 140, 160, 0.05) 0%, transparent 60%),
            linear-gradient(to right, rgba(22, 40, 44, 0.025) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(22, 40, 44, 0.025) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Seamless bottom divider bridge */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(22, 140, 160, 0.15) 50%, transparent 95%)',
        }}
      />

      <div className="os-container" ref={ref} style={{ position: 'relative', zIndex: 1 }}>

        {/* Section Header */}
        <div style={{ maxWidth: '720px', marginBottom: '44px' }}>
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
          >
            <span className="os-label" style={{ margin: 0 }}>THE CHALLENGE</span>
          </motion.div>

          <motion.h2
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="os-heading"
            style={{ marginBottom: '18px', color: '#111a20' }}
          >
            The ocean is not a flat map.
          </motion.h2>

          <motion.p
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="os-body"
            style={{ fontSize: '16.5px', lineHeight: 1.68, color: '#384d56' }}
          >
            Ocean datasets encode enormous information across space, depth and time.
            Traditional 2D maps capture only a fraction of this reality. True ocean
            understanding requires navigating four independent dimensions simultaneously.
          </motion.p>
        </div>

        {/* CENTRAL SCIENTIFIC VISUALIZATION: 4D Ocean Spatiotemporal Continuum */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="os-4d-manifold-container"
          style={{
            background: '#ffffff',
            border: '1px solid #dce5e3',
            borderRadius: '16px',
            padding: '24px 28px 20px',
            marginBottom: '32px',
            boxShadow: '0 4px 20px rgba(22, 40, 44, 0.03)',
            position: 'relative',
          }}
        >
          {/* Manifold Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              paddingBottom: '14px',
              borderBottom: '1px solid #ebf1f0',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#168ca0',
                }}
              >
                4D SPATIOTEMPORAL CONTINUUM
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: '#556d74',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 600,
                }}
              >
                Surface (φ, λ) → Depth (z) → Time (t)
              </span>
            </div>
          </div>

          {/* Isometric Scientific SVG Manifold Diagram */}
          <div
            className="os-manifold-svg-wrapper"
            style={{
              width: '100%',
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <svg
              viewBox="0 0 680 300"
              width="100%"
              height="auto"
              style={{ maxHeight: '300px', overflow: 'visible' }}
              aria-label="4D Ocean Spatiotemporal Coordinate Visualization"
            >
              <defs>
                <linearGradient id="surfaceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#168ca0" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#5a6ab5" stopOpacity="0.04" />
                </linearGradient>

                <linearGradient id="depthColumnGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#168ca0" stopOpacity="0.35" />
                  <stop offset="40%" stopColor="#2daa7a" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#162028" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {/* Time Axis Slices */}
              <g opacity={hoveredDim === 'time' ? '0.85' : '0.4'} style={{ transition: 'opacity 0.25s ease' }}>
                <polygon
                  points="300,34 490,92 300,150 110,92"
                  fill="none"
                  stroke="#c08a2a"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x="96" y="86" fill="#c08a2a" fontSize="8.5" fontFamily="JetBrains Mono, monospace" opacity="0.8">
                  t₋₁ (Reanalysis)
                </text>
              </g>

              <g opacity={hoveredDim === 'time' ? '0.9' : '0.45'} style={{ transition: 'opacity 0.25s ease' }}>
                <polygon
                  points="380,62 570,120 380,178 190,120"
                  fill="none"
                  stroke="#c08a2a"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text x="566" y="130" fill="#c08a2a" fontSize="8.5" fontFamily="JetBrains Mono, monospace" opacity="0.8">
                  t₊₁ (Forecast)
                </text>
              </g>

              {/* Time axis vector */}
              <g opacity={hoveredDim === 'time' ? '1' : '0.65'} style={{ transition: 'opacity 0.25s ease' }}>
                <line x1="205" y1="63" x2="475" y2="150" stroke="#c08a2a" strokeWidth="1.5" strokeDasharray="4 3" />
                <polygon points="480,152 470,146 473,153" fill="#c08a2a" />
                <text x="488" y="157" fill="#c08a2a" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fontWeight="700">
                  +T Time Axis
                </text>
              </g>

              {/* 2D Sea Surface Plane */}
              <polygon
                points="340,48 540,110 340,172 140,110"
                fill="url(#surfaceGrad)"
                stroke={hoveredDim === 'lat' || hoveredDim === 'lon' ? '#168ca0' : '#b2cece'}
                strokeWidth={hoveredDim === 'lat' || hoveredDim === 'lon' ? '1.8' : '1.2'}
                style={{ transition: 'all 0.25s ease' }}
              />

              {/* Longitude Grid */}
              <g stroke="#5a6ab5" strokeWidth={hoveredDim === 'lon' ? '1.4' : '0.8'} opacity={hoveredDim === 'lon' ? '0.85' : '0.35'} style={{ transition: 'all 0.25s ease' }}>
                <line x1="240" y1="79" x2="440" y2="141" />
                <line x1="290" y1="64" x2="490" y2="126" />
                <line x1="190" y1="94" x2="390" y2="156" />
              </g>

              {/* Latitude Grid */}
              <g stroke="#168ca0" strokeWidth={hoveredDim === 'lat' ? '1.4' : '0.8'} opacity={hoveredDim === 'lat' ? '0.85' : '0.35'} style={{ transition: 'all 0.25s ease' }}>
                <line x1="440" y1="79" x2="240" y2="141" />
                <line x1="390" y1="64" x2="190" y2="126" />
                <line x1="490" y1="94" x2="290" y2="156" />
              </g>

              {/* Axis labels */}
              <text x="142" y="102" fill="#168ca0" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="700">
                φ Latitude (N–S)
              </text>
              <text x="492" y="98" fill="#5a6ab5" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="700">
                λ Longitude (E–W)
              </text>

              {/* Vertical Depth Column */}
              <g opacity={hoveredDim === 'depth' ? '0.9' : '0.4'} style={{ transition: 'opacity 0.25s ease' }}>
                <polygon points="340,88 500,138 340,188 180,138" fill="none" stroke="#2daa7a" strokeWidth="0.8" strokeDasharray="2 2" />
                <text x="142" y="142" fill="#2daa7a" fontSize="8" fontFamily="JetBrains Mono, monospace">
                  -200m (Thermocline)
                </text>

                <polygon points="340,128 470,168 340,208 210,168" fill="none" stroke="#2daa7a" strokeWidth="0.8" strokeDasharray="2 2" />
                <text x="172" y="172" fill="#2daa7a" fontSize="8" fontFamily="JetBrains Mono, monospace">
                  -1,000m (Mesopelagic)
                </text>

                <polygon points="340,168 440,200 340,230 240,200" fill="none" stroke="#162028" strokeWidth="1" />
                <text x="202" y="204" fill="#475b63" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                  -4,000m (Abyssal Floor)
                </text>
              </g>

              {/* Central Depth Sounding */}
              <line
                x1={px}
                y1={py}
                x2={px}
                y2={py + 115}
                stroke="#2daa7a"
                strokeWidth={hoveredDim === 'depth' ? '2.2' : '1.5'}
                strokeDasharray="2 2"
                style={{ transition: 'all 0.25s ease' }}
              />

              <polygon points={`${px},${py + 120} ${px - 4},${py + 112} ${px + 4},${py + 112}`} fill="#2daa7a" />
              <text x={px + 8} y={py + 118} fill="#2daa7a" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="700">
                -Z Depth Sounding
              </text>

              {/* Surface Projection and Coordinate Point */}
              <circle cx={px} cy={py} r="3.5" fill="#168ca0" />
              <circle cx={px} cy={py} r="6.5" stroke="#168ca0" strokeWidth="1" opacity="0.4" />

              {/* Target Node at Depth */}
              <circle
                cx={px}
                cy={depthY}
                r={hoveredDim ? '9' : '6.5'}
                fill="rgba(22, 140, 160, 0.15)"
                stroke={hoveredDim ? '#168ca0' : '#2daa7a'}
                strokeWidth="1.2"
              />
              <circle cx={px} cy={depthY} r="3.5" fill="#131b22" />
            </svg>
          </div>
        </motion.div>

        {/* 4 Connected Dimensions Grid */}
        <div className="os-4d-system-wrapper" style={{ marginBottom: '48px' }}>
          <div className="os-4d-cards-grid">
            {dims.map((d, index) => {
              const isHovered = hoveredDim === d.id;

              return (
                <div key={d.id} className="os-dimension-card-wrapper">
                  <motion.div
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.45, delay: 0.14 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={shouldReduceMotion ? {} : { y: -3, transition: { duration: 0.16, ease: 'easeOut' } }}
                    whileTap={{ scale: 0.99 }}
                    className={`os-4d-card ${isHovered ? 'is-active' : ''}`}
                    onMouseEnter={() => setHoveredDim(d.id)}
                    onMouseLeave={() => setHoveredDim(null)}
                    style={{
                      background: isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                      border: `1px solid ${isHovered ? d.color : '#dce5e3'}`,
                      borderTop: `3px solid ${d.color}`,
                      borderRadius: '14px',
                      padding: '24px 22px 20px',
                      boxShadow: isHovered
                        ? `0 12px 32px ${d.glowColor}, 0 2px 6px rgba(0,0,0,0.04)`
                        : '0 2px 12px rgba(22, 40, 44, 0.02)',
                      transition: 'border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                    }}
                  >
                    {/* Dimension Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '12px',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          color: d.color,
                        }}
                      >
                        DIM {d.index}
                      </span>

                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: d.color,
                        }}
                      >
                        {d.symbol}
                      </span>
                    </div>

                    {/* Dimension Label & Unit */}
                    <div style={{ marginBottom: '10px' }}>
                      <div
                        style={{
                          fontFamily: 'Manrope, sans-serif',
                          fontSize: '20px',
                          fontWeight: 800,
                          letterSpacing: '-0.025em',
                          color: '#131b22',
                          lineHeight: 1.2,
                          marginBottom: '2px',
                        }}
                      >
                        {d.label}
                      </div>

                      <div
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: d.color,
                        }}
                      >
                        {d.unit}
                      </div>
                    </div>

                    {/* Dimension Description */}
                    <p
                      style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#44565e',
                        margin: '0 0 16px 0',
                        flexGrow: 1,
                      }}
                    >
                      {d.desc}
                    </p>

                    {/* Domain Footer */}
                    <div
                      style={{
                        paddingTop: '10px',
                        borderTop: '1px solid #edf2f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#60757d',
                      }}
                    >
                      <span>{d.mathDomain}</span>
                      <span style={{ color: d.color, fontWeight: 700 }}>{d.rangeText}</span>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Minimal Editorial Statistics Row */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            padding: '32px 0 0',
            borderTop: '1px solid #dce5e3',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '32px',
              textAlign: 'center',
            }}
            className="stats-grid"
          >
            {stats.map((s, sIdx) => (
              <motion.div
                key={s.label}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.38 + sIdx * 0.06, duration: 0.4 }}
              >
                <div
                  style={{
                    fontFamily: 'Manrope, sans-serif',
                    fontSize: 'clamp(2.2rem, 3.5vw, 3rem)',
                    fontWeight: 800,
                    letterSpacing: '-0.04em',
                    color: s.color,
                    lineHeight: 1,
                    marginBottom: '8px',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: '13.5px', color: '#3d525a', fontWeight: 600 }}>{s.label}</div>
              </motion.div>
            ))}
          </div>

          <div
            style={{
              marginTop: '28px',
              textAlign: 'center',
              fontSize: '14px',
              color: '#4a5e66',
              lineHeight: 1.6,
            }}
          >
            oceanStream makes multidimensional ocean data accessible with{' '}
            <span style={{ color: '#11788a', fontWeight: 700 }}>sub-millisecond</span>
            {' '}cached retrieval and non-blocking asynchronous streaming.
          </div>
        </motion.div>
      </div>

      <style>{`
        .os-4d-cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        @media (max-width: 1024px) {
          .os-4d-cards-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 16px !important;
          }
        }

        @media (max-width: 680px) {
          .os-4d-challenge-section {
            padding: 64px 0 76px !important;
          }
          .os-4d-cards-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .stats-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
          .os-4d-manifold-container {
            padding: 16px 14px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .os-4d-card,
          .os-manifold-svg-wrapper * {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
