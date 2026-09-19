import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Sparkles,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Compass,
  AlertCircle,
  ArrowUp,
  Database,
  Copy,
  Check,
  Radio,
  Layers,
  X,
  Bot,
  ArrowRight,
} from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';
import { sendCopilotMessage } from '../../services/copilotApi';

// ─── ONBOARDING SUGGESTIONS ──────────────────────────────────────────────────

const ONBOARDING_SUGGESTIONS = {
  student: [
    { title: 'Explain this location', desc: 'Discover unique geography & currents', prompt: 'Explain what makes this ocean location interesting and what conditions exist here.' },
    { title: 'What lives at this depth?', desc: 'Explore marine creatures & zones', prompt: 'What marine life, animals, and ecosystems exist at this depth in the ocean?' },
    { title: 'Why is the water cold?', desc: 'Learn how temperature changes with depth', prompt: 'Why does water temperature change with ocean depth and location?' },
    { title: 'What are Argo robots?', desc: 'How autonomous probes sample the sea', prompt: 'What are autonomous Argo floats and how do they measure the ocean?' },
  ],
  scientist: [
    { title: 'Synthesize ocean state', desc: 'Interpret θ, S, currents & height', prompt: 'Interpret the physical and biogeochemical state at these exact coordinates and depth.' },
    { title: 'Water column physics', desc: 'Vertical thermocline & velocity analysis', prompt: 'Summarize the potential temperature, salinity, and current velocity for this coordinate.' },
    { title: 'Biogeochemical summary', desc: 'O₂, Chl-a, pH, and nutrient profile', prompt: 'Analyze the biogeochemical parameters (O2, Chl-a, pH, pCO2, nutrients) at this location.' },
    { title: 'Argo in-situ validation', desc: 'Compare model state with nearest float', prompt: 'Explain the nearest in-situ Argo float observation and how it compares to model data.' },
  ],
};

// ─── HELPER FORMATTERS ───────────────────────────────────────────────────────

function formatCoordinate(value, positive, negative, precision = 3) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${Math.abs(value).toFixed(precision)}°${value >= 0 ? positive : negative}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch {}
  return String(dateStr);
}

// ─── SCIENTIFIC DATA SNAPSHOT (CONCISE RESEARCH VIEW) ────────────────────────

function ScientificDataSnapshot({ data }) {
  if (!data) return null;
  const phy = data.physics || {};
  const bgc = data.bgc || {};
  const argo = data.nearest_argo_float;

  const formatVal = (val, decimals = 2) => {
    if (val === null || val === undefined || !Number.isFinite(Number(val))) {
      return null;
    }
    return Number(val).toFixed(decimals);
  };

  const temp = formatVal(phy.temperature_c, 2);
  const psal = formatVal(phy.salinity_psu, 2);
  const u = phy.current_u_ms;
  const v = phy.current_v_ms;
  const currentSpd =
    u !== null && u !== undefined && v !== null && v !== undefined && Number.isFinite(Number(u)) && Number.isFinite(Number(v))
      ? Math.sqrt(Number(u) ** 2 + Number(v) ** 2).toFixed(2)
      : null;
  const zos = formatVal(phy.sea_level_m, 3);

  const o2 = formatVal(bgc.oxygen_mmolm3, 1);
  const chl = formatVal(bgc.chlorophyll_mgl, 3);
  const ph = formatVal(bgc.ph, 2);
  const pco2 = formatVal(bgc.pco2_uatm, 1);
  const no3 = formatVal(bgc.nitrate_mmolm3, 2);

  const hasMetrics = [temp, psal, currentSpd, zos, o2, chl, ph, pco2, no3].some(Boolean);
  if (!hasMetrics && !argo) return null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-[11px] font-mono">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between border-b border-white/[0.06] pb-1.5 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-cyan-400">
          <Database size={11} />
          <span>Point Hydrography & Biogeochemistry</span>
        </span>
        <span className="text-[9px] text-slate-500">Copernicus ANFC</span>
      </div>

      {/* Grid of Measurements */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        {/* Temperature */}
        <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
          <span className="text-slate-400">Temperature</span>
          <span className="font-semibold text-slate-100">
            {temp !== null ? `${temp} °C` : <span className="text-slate-500 font-normal">—</span>}
          </span>
        </div>

        {/* Salinity */}
        <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
          <span className="text-slate-400">Salinity</span>
          <span className="font-semibold text-slate-100">
            {psal !== null ? `${psal} PSU` : <span className="text-slate-500 font-normal">—</span>}
          </span>
        </div>

        {/* Dissolved Oxygen */}
        <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
          <span className="text-slate-400">Dissolved O₂</span>
          <span className="font-semibold text-teal-300">
            {o2 !== null ? `${o2} mmol/m³` : <span className="text-slate-500 font-normal">—</span>}
          </span>
        </div>

        {/* Chlorophyll-a */}
        <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
          <span className="text-slate-400">Chlorophyll-a</span>
          <span className="font-semibold text-emerald-300">
            {chl !== null ? `${chl} mg/m³` : <span className="text-slate-500 font-normal">—</span>}
          </span>
        </div>

        {/* Ocean pH */}
        <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
          <span className="text-slate-400">Ocean pH</span>
          <span className="font-semibold text-slate-100">
            {ph !== null ? ph : <span className="text-slate-500 font-normal">—</span>}
          </span>
        </div>

        {/* Current Speed / Sea Level */}
        <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
          <span className="text-slate-400">{currentSpd !== null ? 'Current Speed' : 'Sea Level'}</span>
          <span className="font-semibold text-slate-100">
            {currentSpd !== null ? (
              `${currentSpd} m/s`
            ) : zos !== null ? (
              `${zos} m`
            ) : (
              <span className="text-slate-500 font-normal">—</span>
            )}
          </span>
        </div>

        {/* Nitrate (if present) */}
        {no3 !== null && (
          <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
            <span className="text-slate-400">Nitrate (NO₃)</span>
            <span className="font-semibold text-amber-300">{no3} mmol/m³</span>
          </div>
        )}

        {/* pCO2 (if present) */}
        {pco2 !== null && (
          <div className="flex items-center justify-between border-b border-white/[0.03] py-0.5">
            <span className="text-slate-400">pCO₂</span>
            <span className="font-semibold text-rose-300">{pco2} μatm</span>
          </div>
        )}
      </div>

      {/* Nearest Argo Float */}
      {argo && argo.platform_number && (
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-1.5 text-[10.5px]">
          <div className="flex items-center gap-1.5 text-emerald-300">
            <Radio size={12} className="text-emerald-400 shrink-0" />
            <span className="font-semibold">Argo Float #{argo.platform_number}</span>
            {argo.type && <span className="text-slate-400 font-normal">({argo.type})</span>}
          </div>
          {argo.distance_km != null && (
            <span className="font-semibold text-emerald-400">
              {Number(argo.distance_km).toFixed(1)} km away
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── VERTICAL DEPTH COMPARISON TABLE ─────────────────────────────────────────

function DepthComparisonView({ data }) {
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return null;
  const { depths, rows } = data;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-[11px] font-mono">
      <div className="mb-2 flex items-center justify-between border-b border-white/[0.06] pb-1.5 text-[10px]">
        <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-cyan-400">
          <Layers size={11} />
          <span>Vertical Water Column Comparison</span>
        </div>
        <span className="text-[9px] text-slate-500">
          {depths.map((d) => `${d}m`).join(' ↔ ')}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-slate-400 text-[9.5px] uppercase">
              <th className="py-1 text-left font-normal">Variable</th>
              {depths.map((d) => (
                <th key={d} className="py-1 text-right font-semibold text-cyan-300">
                  {d} m
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {rows.map((row) => (
              <tr key={row.variable} className="hover:bg-white/[0.015]">
                <td className="py-1.5 text-slate-300 font-sans text-[11px]">
                  {row.label} <span className="text-[9px] text-slate-500 font-mono">({row.unit})</span>
                </td>
                {depths.map((d) => {
                  const v = row.values[d];
                  return (
                    <td key={d} className="py-1.5 text-right font-semibold text-slate-100">
                      {v !== null && v !== undefined ? v : <span className="text-slate-600 font-normal">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── UNIFIED INVESTIGATION STATUS & TRACE ───────────────────────────────────

function InvestigationTrace({ toolActions, visualizationActions }) {
  const steps = [];

  if (visualizationActions && visualizationActions.length > 0) {
    for (const v of visualizationActions) {
      if (v.summary) {
        steps.push(v.summary);
      } else if (v.payload) {
        if (typeof v.payload.depth === 'number') {
          steps.push(v.payload.depth === 0 ? 'Returned to ocean surface (0 m)' : `Explorer Depth → ${v.payload.depth} m`);
        }
        if (typeof v.payload.lat === 'number' && typeof v.payload.lon === 'number') {
          steps.push(`Explorer Coordinates → ${v.payload.lat.toFixed(2)}°, ${v.payload.lon.toFixed(2)}°`);
        }
      }
    }
  }

  if (toolActions && toolActions.length > 0) {
    for (const t of toolActions) {
      if (t.tool !== 'set_visualization_state') {
        steps.push(
          t.summary ||
            (t.tool === 'query_ocean_point'
              ? 'Retrieved operational ocean state'
              : t.tool === 'compare_ocean_points'
              ? 'Compared vertical depth levels'
              : t.tool === 'find_nearest_argo'
              ? 'Searched in-situ Argo profiling floats'
              : 'Retrieved Argo float vertical observations')
        );
      }
    }
  }

  if (steps.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-0.5 text-[10.5px] font-mono">
      {steps.map((step, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 rounded-md bg-cyan-950/30 border border-cyan-500/20 px-2 py-0.5 text-cyan-200"
        >
          <span className="text-emerald-400 text-[10px]">✓</span>
          <span>{step}</span>
        </span>
      ))}
    </div>
  );
}

// ─── FOLLOW-UP INVESTIGATIONS COMPONENT ──────────────────────────────────────

function FollowUpInvestigations({ followUps, onSelect, isScientist }) {
  if (!followUps || followUps.length === 0) return null;

  return (
    <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-wider text-cyan-400">
        <Compass size={11} className="text-cyan-400" />
        <span>{isScientist ? 'Next Analytical Pathways' : 'Want to explore further?'}</span>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {followUps.map((item, idx) => (
          <motion.button
            key={idx}
            type="button"
            whileHover={{ scale: 1.005, backgroundColor: 'rgba(6,182,212,0.06)' }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onSelect(item.prompt)}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-1.5 text-left text-[11.5px] transition-all hover:border-cyan-400/30 group cursor-pointer"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium text-slate-200 group-hover:text-cyan-200 transition-colors">
                {item.title}
              </span>
              {item.desc && (
                <span className="block text-[10px] text-slate-400 truncate mt-0.5 font-sans">
                  {item.desc}
                </span>
              )}
            </div>
            <ArrowRight size={12} className="text-slate-500 group-hover:text-cyan-300 shrink-0 transition-colors" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ─── DYNAMIC FOLLOW-UP GENERATOR ─────────────────────────────────────────────

function getFollowUpInvestigations({ lastMessage, context, mode, isLatest }) {
  if (!isLatest || !lastMessage || lastMessage.role !== 'assistant') return [];

  const isScientist = mode === 'scientist';
  const { lat, lon, depth } = context || {};
  const hasLocation = lat !== null && lon !== null;
  const currentDepth = typeof depth === 'number' ? depth : 0;
  const scientificData = lastMessage.scientificData;
  const comparisonData = lastMessage.comparisonData;
  const toolActions = lastMessage.toolActions || [];
  const toolsUsed = toolActions.map((t) => t.tool);

  const followUps = [];

  // 1. Comparison Pathway
  if (comparisonData) {
    if (isScientist) {
      followUps.push({
        title: 'Explain vertical gradients',
        desc: 'Analyze thermocline & stratification dynamics',
        prompt: 'Explain the vertical gradients and thermocline/stratification dynamics between these compared depth levels.',
      });
      if (!comparisonData.depths?.includes(1000) && currentDepth < 1000) {
        followUps.push({
          title: 'Compare down to 1000 m',
          desc: 'Extend comparison to intermediate water layer',
          prompt: 'Compare the surface (0m), 500m, and 1000m depth levels at this location.',
        });
      }
    } else {
      followUps.push({
        title: 'Why is deep water colder & darker?',
        desc: 'Discover sunlight penetration and ocean layers',
        prompt: 'Why does the ocean change so much in temperature and light between the surface and deep water?',
      });
      followUps.push({
        title: 'Explore deeper to 1000 m',
        desc: 'Dive down to the midnight ocean zone',
        prompt: 'Take me to 1000 m depth and tell me what creatures live there.',
      });
    }
  } else if (hasLocation) {
    // 2. Point Data Exploration
    if (currentDepth === 0) {
      if (isScientist) {
        followUps.push({
          title: 'Compare vertical state (0m vs 500m)',
          desc: 'Evaluate mixed layer vs mesopelagic',
          prompt: 'Compare the ocean state at the surface (0m) and 500m depth at this location.',
        });
        followUps.push({
          title: 'Probe intermediate depth (1000 m)',
          desc: 'Query Antarctic Intermediate Water / thermocline base',
          prompt: 'Set the depth to 1000 m and analyze potential temperature, salinity, and dissolved oxygen.',
        });
      } else {
        followUps.push({
          title: 'Dive to the twilight zone (500 m)',
          desc: 'Explore the dim layer where deep sea life begins',
          prompt: 'Take me down to 500 m depth and tell me what conditions exist there.',
        });
        followUps.push({
          title: 'Compare with deep water',
          desc: 'See how surface conditions compare to 500m depth',
          prompt: 'Compare 0m and 500m at this location.',
        });
      }
    } else {
      // Submerged depth > 0
      if (isScientist) {
        followUps.push({
          title: 'Compare with surface (0 m)',
          desc: 'Quantify stratification relative to mixed layer',
          prompt: `Compare the surface (0m) and ${currentDepth}m depth at this location.`,
        });
        if (currentDepth < 1000) {
          followUps.push({
            title: 'Explore deeper (1000 m)',
            desc: 'Inspect intermediate ocean circulation',
            prompt: 'Set depth to 1000 m and query physical and biogeochemical state.',
          });
        } else {
          followUps.push({
            title: 'Return to surface (0 m)',
            desc: 'Navigate back to the sunlit mixed layer',
            prompt: 'Show the surface.',
          });
        }
      } else {
        followUps.push({
          title: 'Compare with surface',
          desc: 'See differences between here and the sunlit surface',
          prompt: `Compare 0m and ${currentDepth}m at this spot.`,
        });
        followUps.push({
          title: 'Show the surface',
          desc: 'Return to the ocean surface view',
          prompt: 'Show the surface.',
        });
      }
    }

    // 3. Argo in-situ Validation Pathway
    const nearestArgo = scientificData?.nearest_argo_float;
    if (nearestArgo && nearestArgo.platform_number) {
      if (isScientist) {
        followUps.push({
          title: `Inspect Argo Float #${nearestArgo.platform_number}`,
          desc: `In-situ profile observations (${Number(nearestArgo.distance_km || 0).toFixed(0)} km away)`,
          prompt: `Retrieve the profile data for nearest Argo float ${nearestArgo.platform_number} and compare it with the model state.`,
        });
      } else {
        followUps.push({
          title: `Learn about nearby Argo robot #${nearestArgo.platform_number}`,
          desc: `Autonomous scientific float floating ${Number(nearestArgo.distance_km || 0).toFixed(0)} km away`,
          prompt: `Tell me about the nearby Argo float #${nearestArgo.platform_number} and what it is measuring in this area.`,
        });
      }
    } else if (!toolsUsed.includes('find_nearest_argo')) {
      if (isScientist) {
        followUps.push({
          title: 'Search in-situ Argo floats',
          desc: 'Find observational floats within 500 km radius',
          prompt: 'Find the nearest Argo floats around this location to validate the model.',
        });
      } else {
        followUps.push({
          title: 'Find nearby ocean robot floats',
          desc: 'Check if real autonomous Argo floats are nearby',
          prompt: 'Are there any autonomous Argo robot floats near this location?',
        });
      }
    }

    // 4. Biogeochemical Deep Dive
    const bgc = scientificData?.bgc;
    if (bgc && typeof bgc.oxygen_mmolm3 === 'number') {
      if (isScientist) {
        followUps.push({
          title: 'Analyze Dissolved O₂ & Biogeochemistry',
          desc: 'Interpret hypoxia, ventilation & carbon chemistry',
          prompt: 'Analyze the dissolved oxygen concentration and biogeochemical balance at this depth.',
        });
      } else {
        followUps.push({
          title: 'Why do ocean creatures need oxygen here?',
          desc: 'Learn how fish and marine life breathe at this depth',
          prompt: 'Explain the dissolved oxygen level here and how marine life survives.',
        });
      }
    }
  } else {
    // No location selected
    if (isScientist) {
      followUps.push({
        title: 'Move to Arabian Sea Oxygen Minimum Zone',
        desc: 'Examine 15.0°N, 65.0°E at 200m depth',
        prompt: 'Move to 15N 65E at 200 m and analyze the intense oxygen minimum zone.',
      });
      followUps.push({
        title: 'Examine Bay of Bengal Stratification',
        desc: 'Freshwater-driven low salinity barrier layer (12.0°N, 85.0°E)',
        prompt: 'Move to 12N 85E and compare salinity and temperature at 0m and 100m.',
      });
    } else {
      followUps.push({
        title: 'Explore the Indian Ocean',
        desc: 'Visit a tropical ocean spot full of marine life',
        prompt: 'Move to 10N 75E and show me the surface ocean conditions.',
      });
      followUps.push({
        title: 'Discover deep sea trenches',
        desc: 'Learn about the deepest zones of the world ocean',
        prompt: 'What are the deepest ocean zones and what strange life lives down there?',
      });
    }
  }

  return followUps.slice(0, 3);
}

// ─── RICH MARKDOWN & CODE PARSER ─────────────────────────────────────────────

function InlineText({ text }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded border border-cyan-500/20 bg-cyan-950/40 px-1 py-0.5 font-mono text-[11px] font-medium text-cyan-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={index} className="font-medium not-italic text-cyan-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function MessageText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-slate-200">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }

        const isBullet = /^[-*•]\s+/.test(trimmed);
        const isNumbered = /^\d+\.\s+/.test(trimmed);
        const isHeading = /^#{1,4}\s+/.test(trimmed);

        if (isHeading) {
          const headingText = trimmed.replace(/^#{1,4}\s+/, '');
          return (
            <div key={index} className="mt-2.5 mb-1 text-[13px] font-semibold text-slate-100 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <InlineText text={headingText} />
            </div>
          );
        }

        if (isBullet) {
          const content = trimmed.replace(/^[-*•]\s+/, '');
          return (
            <div key={index} className="my-0.5 flex items-start gap-2 pl-0.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              <div className="flex-1 leading-relaxed">
                <InlineText text={content} />
              </div>
            </div>
          );
        }

        if (isNumbered) {
          const numMatch = trimmed.match(/^(\d+)\.\s+/);
          const num = numMatch ? numMatch[1] : '1';
          const content = trimmed.replace(/^\d+\.\s+/, '');
          return (
            <div key={index} className="my-0.5 flex items-start gap-2 pl-0.5">
              <span className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-cyan-400">{num}.</span>
              <div className="flex-1 leading-relaxed">
                <InlineText text={content} />
              </div>
            </div>
          );
        }

        return (
          <div key={index} className="leading-relaxed">
            <InlineText text={line} />
          </div>
        );
      })}
    </div>
  );
}

// ─── MODERN COPY BUTTON ──────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
      title="Copy response"
      aria-label="Copy response"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

// ─── MAIN MODERN COPILOT COMPONENT ───────────────────────────────────────────

export default function OceanStreamCopilot({ selectedPoint, onSelectPoint }) {
  const { userMode, selectedDepth, selectedDate } = useApp();
  const dispatch = useAppDispatch();
  const reducedMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const endRef = useRef(null);
  const textareaRef = useRef(null);

  // Active investigation context passed to the API
  const context = useMemo(
    () => ({
      lat: selectedPoint?.lat ?? null,
      lon: selectedPoint?.lon ?? null,
      depth: selectedDepth ?? null,
      date: selectedDate ?? null,
    }),
    [selectedPoint, selectedDepth, selectedDate]
  );

  // Derived coordinate label for launcher & context bar
  const latStr = formatCoordinate(selectedPoint?.lat, 'N', 'S', 2);
  const lonStr = formatCoordinate(selectedPoint?.lon, 'E', 'W', 2);
  const hasPoint = Boolean(latStr && lonStr);
  const formattedDate = formatDisplayDate(selectedDate);
  const depthValue = typeof selectedDepth === 'number' ? `${selectedDepth}m` : '0m';

  const isScientist = userMode === 'scientist';
  const modeBadge = isScientist ? 'Scientist' : 'Student';

  const suggestions = useMemo(() => {
    return isScientist ? ONBOARDING_SUGGESTIONS.scientist : ONBOARDING_SUGGESTIONS.student;
  }, [isScientist]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, isSending, reducedMotion]);

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [draft]);

  function openCopilot() {
    setIsOpen(true);
  }

  async function submitMessage(event, promptText) {
    event?.preventDefault();
    const message = (promptText ?? draft).trim();
    if (!message || isSending) return;

    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setError(null);
    setLastFailedMessage(message);
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: message },
    ]);
    setIsSending(true);

    try {
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const result = await sendCopilotMessage({ message, mode: userMode, context, history });

      // Execute Explorer visualization actions via existing application mechanisms
      if (Array.isArray(result.visualizationActions) && result.visualizationActions.length > 0) {
        for (const action of result.visualizationActions) {
          if (action.type === 'set_visualization_state' && action.payload) {
            const { depth, date, lat, lon } = action.payload;
            if (typeof depth === 'number' && Number.isFinite(depth) && depth >= 0 && depth <= 6000) {
              dispatch?.({ type: 'SET_DEPTH', payload: depth });
            }
            if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date.trim())) {
              dispatch?.({ type: 'SET_DATE', payload: date.trim() });
            }
            if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
              onSelectPoint?.({ lat, lon });
            }
          }
        }
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          dataSource: result.dataSource,
          queryContext: result.queryContext,
          scientificDataStatus: result.scientificDataStatus,
          scientificData: result.scientificData,
          toolActions: result.toolActions,
          visualizationActions: result.visualizationActions,
          comparisonData: result.comparisonData,
        },
      ]);
      setLastFailedMessage(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  function clearConversation() {
    setError(null);
    setLastFailedMessage(null);
    setMessages([]);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex justify-end sm:inset-x-auto sm:bottom-6 sm:right-6">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          /* =========================================================
             EXECUTIVE LAUNCHER PILL
             ========================================================= */
          <motion.button
            key="launcher"
            type="button"
            initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.95 }}
            whileHover={reducedMotion ? undefined : { y: -2, scale: 1.01 }}
            whileTap={reducedMotion ? undefined : { scale: 0.98 }}
            onClick={openCopilot}
            className="group pointer-events-auto relative flex h-[52px] items-center gap-3 rounded-full border border-white/10 bg-[#070b12]/95 px-4 py-2 text-left text-slate-100 shadow-[0_15px_40px_rgba(0,0,0,0.7),0_0_20px_rgba(6,182,212,0.1)] backdrop-blur-2xl transition-all duration-300 hover:border-cyan-400/40 cursor-pointer overflow-hidden"
            aria-label="Open OceanStream Copilot"
          >
            {/* Spark Avatar */}
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 p-[1.5px]">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#070b12]">
                <Sparkles size={14} className="text-cyan-300" />
              </div>
            </div>

            {/* Title & Status */}
            <div className="relative min-w-0 pr-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold tracking-tight text-white font-sans">
                  OceanStream Copilot
                </span>
                <span className="rounded bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.2 text-[8.5px] font-mono font-semibold text-cyan-300 uppercase">
                  {modeBadge}
                </span>
              </div>
              <div className="truncate text-[11px] text-slate-400 font-sans">
                {hasPoint ? `${latStr}, ${lonStr} · ${depthValue}` : 'Copernicus & Argo Intelligence'}
              </div>
            </div>

            {/* Arrow */}
            <div className="relative ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 group-hover:text-cyan-200 transition-colors">
              <ChevronUp size={14} />
            </div>
          </motion.button>
        ) : (
          /* =========================================================
             PROFESSIONAL RESEARCH CONSOLE PANEL
             ========================================================= */
          <motion.section
            key="chat-panel"
            initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="pointer-events-auto relative flex h-[min(700px,calc(100vh-4.5rem))] w-full sm:w-[450px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[#070b12]/95 text-slate-100 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(6,182,212,0.08)] backdrop-blur-2xl ring-1 ring-black/50 select-none font-sans"
            aria-label="OceanStream Copilot"
          >
            {/* ── TOP CONSOLE HEADER ───────────────────────────────── */}
            <header className="shrink-0 relative z-10 border-b border-white/[0.08] bg-[#0c121e]/90 px-4 py-3 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                {/* Left: Branding */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-500 p-[1.5px] shadow-sm">
                    <div className="flex h-full w-full items-center justify-center rounded-md bg-[#070b12]">
                      <Sparkles size={13} className="text-cyan-300" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13.5px] font-semibold text-white tracking-tight leading-none">
                        OceanStream Copilot
                      </h3>
                      <span className="rounded bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 text-[8.5px] font-mono font-semibold text-cyan-300 uppercase">
                        {modeBadge}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={clearConversation}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    title="New conversation"
                    aria-label="New conversation"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    title="Minimize"
                    aria-label="Minimize"
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>
              </div>

              {/* Telemetry Status Bar */}
              <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.05] pt-2 text-[10.5px] font-mono text-slate-400">
                <div className="flex items-center gap-2 truncate">
                  <span className="flex items-center gap-1 text-cyan-300">
                    <Compass size={11} className="text-cyan-400 shrink-0" />
                    <span>{hasPoint ? `${latStr}, ${lonStr}` : 'Global Ocean'}</span>
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-300">{depthValue}</span>
                  {formattedDate && (
                    <>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-300">{formattedDate}</span>
                    </>
                  )}
                </div>
                <span className="text-[9.5px] text-slate-500 shrink-0 pl-1">
                  Copernicus · Argo
                </span>
              </div>
            </header>

            {/* ── CONVERSATION STREAM ──────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800/60">
              {/* Empty State / Suggestions */}
              {messages.length === 0 && (
                <div className="space-y-4 pt-2">
                  <div className="text-center space-y-1.5 py-4">
                    <div className="inline-flex p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 mb-1">
                      <Bot size={22} />
                    </div>
                    <h4 className="text-[14px] font-semibold text-white tracking-tight">
                      Oceanographic Investigation Assistant
                    </h4>
                    <p className="text-[12px] text-slate-400 max-w-[300px] mx-auto leading-relaxed">
                      Ask any question about physical hydrography, biogeochemistry, depth stratification, or autonomous Argo floats.
                    </p>
                  </div>

                  {/* Suggestion Prompts */}
                  <div className="space-y-1.5">
                    <div className="text-[10.5px] font-mono font-medium uppercase tracking-wider text-slate-400 px-1">
                      Suggested Inquiries
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {suggestions.map((item, idx) => (
                        <motion.button
                          key={idx}
                          type="button"
                          whileHover={{ scale: 1.005, backgroundColor: 'rgba(255,255,255,0.04)' }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => submitMessage(undefined, item.prompt)}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-left transition-all cursor-pointer group hover:border-cyan-400/30"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-medium text-slate-200 group-hover:text-cyan-200 transition-colors">
                              {item.title}
                            </div>
                            <div className="text-[11px] text-slate-400 leading-snug mt-0.5 font-sans">
                              {item.desc}
                            </div>
                          </div>
                          <ArrowRight size={13} className="text-slate-500 group-hover:text-cyan-300 shrink-0 transition-colors" />
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map((message, messageIndex) => {
                const isUser = message.role === 'user';

                if (isUser) {
                  return (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-cyan-500/15 border border-cyan-400/25 px-3.5 py-2 text-slate-100 shadow-sm">
                        <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Assistant Message (Clean Research Block)
                const isDataGrounded =
                  Boolean(message.dataSource) ||
                  Boolean(message.queryContext) ||
                  message.scientificDataStatus === 'grounded' ||
                  message.scientificDataStatus === 'available';

                return (
                  <div key={message.id} className="flex justify-start">
                    <div className="w-full rounded-2xl rounded-tl-xs bg-white/[0.025] border border-white/[0.07] p-3.5 shadow-sm backdrop-blur-sm space-y-2.5">
                      {/* Message Top Line: Copilot Tag + Actions */}
                      <div className="flex items-center justify-between border-b border-white/[0.05] pb-1.5 text-[11px]">
                        <div className="flex items-center gap-1.5 text-cyan-300 font-semibold font-mono">
                          <Sparkles size={11} className="text-cyan-400" />
                          <span>Copilot Analysis</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isDataGrounded && (
                            <span className="flex items-center gap-1 font-mono text-[9px] text-cyan-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                              Grounded
                            </span>
                          )}
                          <CopyButton text={message.content} />
                        </div>
                      </div>

                      {/* Investigation Status & Trace */}
                      {(message.toolActions?.length > 0 || message.visualizationActions?.length > 0) && (
                        <InvestigationTrace
                          toolActions={message.toolActions}
                          visualizationActions={message.visualizationActions}
                        />
                      )}

                      {/* Content */}
                      <MessageText text={message.content} />

                      {/* Depth Comparison Matrix (if comparison executed) */}
                      {message.comparisonData && (
                        <DepthComparisonView data={message.comparisonData} />
                      )}

                      {/* Scientific Data Snapshot (Single Point Values) */}
                      {message.scientificData && !message.comparisonData && (
                        <ScientificDataSnapshot data={message.scientificData} />
                      )}

                      {/* Grounding Source Info (Minimal) */}
                      {isDataGrounded && (
                        <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-500 pt-1 border-t border-white/[0.04]">
                          <span>Provenance: {message.dataSource?.dataset || 'Copernicus ANFC · In-situ Argo GDAC'}</span>
                        </div>
                      )}

                      {/* Follow-up Contextual Investigations (for latest response) */}
                      {!isSending && messageIndex === messages.length - 1 && (
                        <FollowUpInvestigations
                          followUps={getFollowUpInvestigations({
                            lastMessage: message,
                            context,
                            mode: userMode,
                            isLatest: true,
                          })}
                          onSelect={(prompt) => submitMessage(undefined, prompt)}
                          isScientist={isScientist}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Shimmer Processing State */}
              {isSending && (
                <div className="flex justify-start">
                  <div className="w-full rounded-2xl rounded-tl-xs bg-white/[0.025] border border-cyan-500/20 p-3.5 shadow-sm space-y-2">
                    <div className="flex items-center gap-2 text-[11.5px] font-semibold text-cyan-300 font-mono">
                      <Sparkles size={12} className="text-cyan-300 animate-spin" style={{ animationDuration: '2.5s' }} />
                      <span>Synthesizing ocean state...</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800/80">
                      <div className="h-full w-full animate-[shimmer_1.8s_infinite] rounded-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-500 bg-[length:200%_auto]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* ── ERROR NOTIFICATION ───────────────────────────────── */}
            {error && (
              <div className="mx-3.5 mb-2 rounded-xl border border-rose-500/30 bg-rose-950/60 p-2.5 text-rose-200 backdrop-blur-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-400" />
                    <div>
                      <div className="text-[11.5px] font-semibold text-rose-300">
                        Query Error
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {error}
                      </p>
                      {lastFailedMessage && (
                        <button
                          type="button"
                          onClick={() => submitMessage(undefined, lastFailedMessage)}
                          className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10.5px] font-medium text-rose-200 hover:bg-rose-500/30 transition-colors"
                        >
                          <RotateCcw size={10} />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="p-0.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    aria-label="Dismiss error"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* ── DOCKED CONSOLE COMPOSER ──────────────────────────── */}
            <div className="shrink-0 border-t border-white/[0.08] bg-[#0c121e]/90 p-3 backdrop-blur-xl">
              <form onSubmit={submitMessage} className="relative">
                <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/40 p-2 transition-all focus-within:border-cyan-400/40 focus-within:bg-black/60 shadow-inner">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about this ocean point, depth, or parameters..."
                    rows={1}
                    maxLength={2000}
                    disabled={isSending}
                    className="max-h-24 min-h-[26px] flex-1 resize-none bg-transparent px-2 py-0.5 text-[12.5px] text-white outline-none placeholder:text-slate-500 disabled:opacity-50 font-sans"
                    aria-label="Ask OceanStream Copilot"
                  />

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={!draft.trim() || isSending}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-sm transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    aria-label="Send query"
                    title="Send query"
                  >
                    <ArrowUp size={15} strokeWidth={2.5} />
                  </motion.button>
                </div>
              </form>

              {/* Bottom Hint */}
              <div className="mt-1 flex items-center justify-between px-1 text-[9.5px] font-mono text-slate-500">
                <span>Press Enter ↵ to query</span>
                <span>{draft.length}/2000</span>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}