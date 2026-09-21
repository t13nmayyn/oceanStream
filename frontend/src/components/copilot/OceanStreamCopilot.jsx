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
    if (val === null || val === undefined || !Number.isFinite(Number(val))) return null;
    return Number(val).toFixed(decimals);
  };

  const temp = formatVal(phy.temperature_c, 2);
  const psal = formatVal(phy.salinity_psu, 2);
  const u = phy.current_u_ms;
  const v = phy.current_v_ms;
  const currentSpd = (u !== null && u !== undefined && v !== null && v !== undefined && Number.isFinite(Number(u)) && Number.isFinite(Number(v)))
    ? Math.sqrt(Number(u) ** 2 + Number(v) ** 2).toFixed(2)
    : null;
  const zos = formatVal(phy.sea_level_m, 3);
  const o2 = formatVal(bgc.oxygen_mmolm3, 1);
  const chl = formatVal(bgc.chlorophyll_mgl, 3);
  const ph = formatVal(bgc.ph, 2);
  const pco2 = formatVal(bgc.pco2_uatm, 1);
  const no3 = formatVal(bgc.nitrate_mmolm3, 2);

  const metrics = [];
  if (temp !== null) metrics.push(`Temperature ${temp} °C`);
  if (psal !== null) metrics.push(`Salinity ${psal} PSU`);
  if (o2 !== null) metrics.push(`O₂ ${o2} mmol/m³`);
  if (chl !== null) metrics.push(`Chl-a ${chl} mg/m³`);
  if (ph !== null) metrics.push(`pH ${ph}`);
  if (currentSpd !== null) metrics.push(`Current Vel ${currentSpd} m/s`);
  else if (zos !== null) metrics.push(`Sea Level ${zos} m`);
  if (no3 !== null) metrics.push(`NO₃ ${no3} mmol/m³`);
  if (pco2 !== null) metrics.push(`pCO₂ ${pco2} μatm`);

  const hasMetrics = metrics.length > 0;
  if (!hasMetrics && !argo) return null;

  return (
    <div className="mt-2 mb-2 text-[13px] text-slate-300">
      <div className="mb-1 text-[11px] font-bold tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
        <Database size={11} className="text-slate-400" />
        OCEAN DATA
      </div>
      <div className="leading-relaxed font-mono text-[12px] text-slate-200 break-words">
        {metrics.join(' · ')}
      </div>
      {argo && argo.platform_number && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
          <Radio size={11} className="shrink-0" />
          <span>Argo #{argo.platform_number} {argo.distance_km != null ? `(${Number(argo.distance_km).toFixed(1)} km away)` : ''}</span>
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
    <div className="mt-3 mb-2 overflow-x-auto pb-1">
      <table className="text-left text-[13px] text-slate-200 w-full min-w-[250px]">
        <thead>
          <tr className="border-b border-white/10 text-slate-400 text-[11px] uppercase">
            <th className="py-1 font-medium w-[40%]">Variable</th>
            {depths.map((d) => (
              <th key={d} className="py-1 font-medium text-right font-mono">{d} m</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={row.variable}>
              <td className="py-1.5 font-sans">
                {row.label} <span className="text-[10px] text-slate-500 font-mono">({row.unit})</span>
              </td>
              {depths.map((d) => {
                const v = row.values[d];
                return (
                  <td key={d} className="py-1.5 text-right font-mono text-slate-300">
                    {v !== null && v !== undefined ? v : <span className="text-slate-600">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── UNIFIED INVESTIGATION STATUS & TRACE ───────────────────────────────────

function InvestigationTrace({ toolActions, visualizationActions }) {
  const traces = [];

  if (visualizationActions && visualizationActions.length > 0) {
    for (const v of visualizationActions) {
      if (v.payload && (typeof v.payload.depth === 'number' || typeof v.payload.lat === 'number')) {
        let details = [];
        if (typeof v.payload.depth === 'number') details.push(`${v.payload.depth} m`);
        if (typeof v.payload.lat === 'number' && typeof v.payload.lon === 'number') {
           details.push(`${formatCoordinate(v.payload.lat, 'N', 'S', 3)} · ${formatCoordinate(v.payload.lon, 'E', 'W', 3)}`);
        }
        traces.push(`Explorer updated · ${details.join(' · ')}`);
      } else if (v.summary) {
        traces.push(v.summary);
      }
    }
  }

  if (toolActions && toolActions.length > 0) {
    for (const t of toolActions) {
      if (t.tool !== 'set_visualization_state') {
        traces.push(
          t.summary ||
            (t.tool === 'query_ocean_point'
              ? 'Querying OceanStream data'
              : t.tool === 'compare_ocean_points'
              ? 'Comparing depth levels'
              : t.tool === 'find_nearest_argo'
              ? 'Searching Argo floats'
              : 'Retrieving Argo profile')
        );
      }
    }
  }

  if (traces.length === 0) return null;

  return (
    <div className="mb-2 flex flex-col gap-1 text-[11.5px] text-slate-400 font-mono">
      {traces.map((trace, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span className="text-slate-500">↳</span>
          <span>{trace}</span>
        </div>
      ))}
    </div>
  );
}

// ─── FOLLOW-UP INVESTIGATIONS COMPONENT ──────────────────────────────────────

function FollowUpInvestigations({ followUps, onSelect }) {
  if (!followUps || followUps.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {followUps.map((item, idx) => (
        <motion.button
          key={idx}
          type="button"
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.08)' }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(item.prompt)}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-cyan-100 transition-colors cursor-pointer"
        >
          {item.title}
        </motion.button>
      ))}
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
        title: 'Why is deep water colder?',
        desc: 'Discover sunlight penetration and ocean layers',
        prompt: 'Why does the ocean change so much in temperature and light between the surface and deep water?',
      });
      followUps.push({
        title: 'Explore 1000 m',
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
          title: `Learn about nearby Argo robot`,
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
          title: 'Find nearby ocean robots',
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
          title: 'Analyze Dissolved O₂',
          desc: 'Interpret hypoxia, ventilation & carbon chemistry',
          prompt: 'Analyze the dissolved oxygen concentration and biogeochemical balance at this depth.',
        });
      } else {
        followUps.push({
          title: 'Why do creatures need oxygen here?',
          desc: 'Learn how fish and marine life breathe at this depth',
          prompt: 'Explain the dissolved oxygen level here and how marine life survives.',
        });
      }
    }
  } else {
    // No location selected
    if (isScientist) {
      followUps.push({
        title: 'Examine OMZ',
        desc: 'Examine 15.0°N, 65.0°E at 200m depth',
        prompt: 'Move to 15N 65E at 200 m and analyze the intense oxygen minimum zone.',
      });
      followUps.push({
        title: 'Examine Stratification',
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
          className="rounded border border-cyan-500/20 bg-cyan-950/40 px-1 py-0.5 font-mono text-[12px] font-medium text-cyan-200"
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

function normalizeLatex(text) {
  if (!text) return text;
  let normalized = text;
  // Standardize simple LaTeX scientific responses
  normalized = normalized.replace(/\$([0-9.]+)\\text{−}([0-9.]+)\\text{ m}\$/g, '$1–$2 m');
  normalized = normalized.replace(/\\text{mmol\/m}\^3/g, 'mmol/m³');
  normalized = normalized.replace(/\\text{mg\/m}\^3/g, 'mg/m³');
  normalized = normalized.replace(/\\text{pCO}_2/g, 'pCO₂');
  normalized = normalized.replace(/\$\\approx\s*([0-9.]+)\$/g, '≈ $1');
  normalized = normalized.replace(/\\text{−}/g, '–');
  normalized = normalized.replace(/\\text{m}/g, 'm');
  
  // Strip any remaining generic $ wraps that just hold text/numbers
  normalized = normalized.replace(/\$([^$\n]+)\$/g, (match, p1) => {
    if (/^[a-zA-Z0-9\s.,–-]+$/.test(p1)) return p1;
    return match;
  });
  return normalized;
}

function MessageText({ text }) {
  if (!text) return null;
  const normalizedText = normalizeLatex(text);
  const lines = normalizedText.split('\n');

  return (
    <div className="space-y-3 text-[14px] leading-[1.6] text-slate-200">
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
            <div key={index} className="mt-4 mb-2 text-[12px] font-bold tracking-wide text-slate-100 uppercase">
              <InlineText text={headingText} />
            </div>
          );
        }

        if (isBullet) {
          const content = trimmed.replace(/^[-*•]\s+/, '');
          return (
            <div key={index} className="my-0.5 flex items-start gap-2 pl-0.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              <div className="flex-1 leading-[1.6]">
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
              <span className="mt-0.5 shrink-0 font-mono text-[12px] font-bold text-cyan-400">{num}.</span>
              <div className="flex-1 leading-[1.6]">
                <InlineText text={content} />
              </div>
            </div>
          );
        }

        return (
          <div key={index} className="leading-[1.6]">
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
      const apiMode = userMode === 'analyze' ? 'scientist' : 'student';
      const result = await sendCopilotMessage({ message, mode: apiMode, context, history });

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
    <div className="pointer-events-none fixed top-[64px] bottom-4 right-4 z-[70] flex justify-end">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          /* =========================================================
             EXECUTIVE LAUNCHER PILL
             ========================================================= */
          <motion.button
            key="launcher"
            type="button"
            initial={reducedMotion ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: 20 }}
            whileHover={reducedMotion ? undefined : { scale: 1.02 }}
            whileTap={reducedMotion ? undefined : { scale: 0.98 }}
            onClick={openCopilot}
            className="pointer-events-auto absolute bottom-0 right-0 flex h-[48px] items-center gap-3 rounded-full border border-white/10 bg-[#070b12]/95 px-4 py-2 text-left text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all duration-300 hover:border-cyan-400/40 cursor-pointer overflow-hidden"
            aria-label="Ask about this ocean"
          >
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#070b12]">
                <Sparkles size={12} className="text-cyan-300" />
              </div>
            </div>
            <div className="relative min-w-0 pr-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold tracking-tight text-white font-sans whitespace-nowrap">
                  Ask about this ocean
                </span>
                <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap shrink-0">
                  {modeBadge}
                </span>
              </div>
            </div>
          </motion.button>
        ) : (
          /* =========================================================
             PREMIUM AI ASSISTANT PANEL
             ========================================================= */
          <motion.section
            key="chat-panel"
            initial={reducedMotion ? false : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto relative flex h-full w-[390px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#070b14]/95 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-3xl select-none font-sans"
            aria-label="OceanStream Copilot"
          >
            {/* ── TOP MINIMAL HEADER ───────────────────────────────── */}
            <header className="shrink-0 relative z-10 pt-4 pb-2 px-4 bg-gradient-to-b from-black/40 to-transparent">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-400" />
                  <h3 className="text-[16px] font-medium text-white tracking-tight leading-none">
                    OceanStream Copilot
                  </h3>
                  <span className="text-[12px] font-medium text-slate-400 ml-1">
                    {modeBadge}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <button
                    type="button"
                    onClick={clearConversation}
                    className="p-1.5 rounded-md hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    title="New conversation"
                    aria-label="New conversation"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-md hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    title="Minimize"
                    aria-label="Minimize"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>
              </div>
              
              {/* Subtle Context Line */}
              <div className="flex items-center text-[11.5px] text-slate-500 font-mono tracking-wide pl-6 mt-1">
                {hasPoint ? (
                  <span>
                    {latStr} · {lonStr} · {depthValue} · {formattedDate ? formattedDate : 'Current'}
                  </span>
                ) : (
                  <span>No location selected</span>
                )}
              </div>
            </header>

            {/* ── CONVERSATION STREAM ──────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700/50 pb-6">
              {/* Empty State / Suggestions */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[70%] space-y-8 pb-10">
                  <div className="text-center space-y-3">
                    <div className="inline-flex text-cyan-400 opacity-90 mb-1">
                      <Sparkles size={28} />
                    </div>
                    <h4 className="text-[18px] font-medium text-white tracking-tight">
                      OceanStream Copilot
                    </h4>
                    <p className="text-[13px] text-slate-400 max-w-[260px] mx-auto leading-relaxed">
                      Your AI assistant for exploring oceanographic data.
                    </p>
                  </div>

                  <div className="flex flex-col w-full gap-2 px-2 max-w-[300px]">
                    <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest text-center mb-2">
                      Try asking:
                    </div>
                    {suggestions.map((item, idx) => (
                      <motion.button
                        key={idx}
                        type="button"
                        whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => submitMessage(undefined, item.prompt)}
                        className="flex items-center p-3 rounded-xl border border-white/5 bg-white/[0.02] text-left transition-all cursor-pointer group"
                      >
                        <span className="text-[13px] font-medium text-slate-300 group-hover:text-cyan-300 transition-colors">
                          {item.prompt}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map((message, messageIndex) => {
                const isUser = message.role === 'user';

                if (isUser) {
                  return (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#121c2c] px-4 py-2.5 text-[14px] text-cyan-50 shadow-sm leading-relaxed">
                        <div className="whitespace-pre-wrap break-words">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Assistant Message
                const isDataGrounded =
                  Boolean(message.dataSource) ||
                  Boolean(message.queryContext) ||
                  message.scientificDataStatus === 'grounded' ||
                  message.scientificDataStatus === 'available';

                return (
                  <div key={message.id} className="flex justify-start w-full">
                    <div className="flex w-full flex-col gap-2">
                      {/* Name/Avatar Row */}
                      <div className="flex items-center gap-2 text-[14px] font-semibold text-white tracking-tight">
                        <Sparkles size={14} className="text-cyan-400" />
                        <span>Copilot</span>
                      </div>

                      {/* Message Body */}
                      <div className="flex flex-col space-y-3 pl-[22px]">
                        {/* Investigation Status & Trace */}
                        {(message.toolActions?.length > 0 || message.visualizationActions?.length > 0) && (
                          <InvestigationTrace
                            toolActions={message.toolActions}
                            visualizationActions={message.visualizationActions}
                          />
                        )}

                        {/* Content */}
                        <MessageText text={message.content} />

                        {/* Depth Comparison Matrix */}
                        {message.comparisonData && (
                          <DepthComparisonView data={message.comparisonData} />
                        )}

                        {/* Scientific Data Snapshot */}
                        {message.scientificData && !message.comparisonData && (
                          <ScientificDataSnapshot data={message.scientificData} />
                        )}

                        {/* Follow-up Contextual Investigations */}
                        {!isSending && messageIndex === messages.length - 1 && (
                          <FollowUpInvestigations
                            followUps={getFollowUpInvestigations({
                              lastMessage: message,
                              context,
                              mode: userMode,
                              isLatest: true,
                            })}
                            onSelect={(prompt) => submitMessage(undefined, prompt)}
                          />
                        )}

                        {/* Metadata Footer (Provenance) */}
                        {isDataGrounded && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-3">
                            <span>
                              Source · {message.dataSource?.dataset || 'Copernicus ANFC'} · {formattedDate ? formattedDate : 'Current'}
                            </span>
                            <CopyButton text={message.content} />
                          </div>
                        )}
                        {!isDataGrounded && (
                          <div className="flex items-center justify-end pt-1">
                            <CopyButton text={message.content} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Shimmer Processing State */}
              {isSending && (
                <div className="flex justify-start w-full">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-white tracking-tight">
                      <Sparkles size={14} className="text-cyan-400 animate-pulse" />
                      <span>Copilot</span>
                    </div>
                    <div className="pl-[22px] text-[13.5px] text-slate-400 flex items-center gap-2 mt-1">
                      <div className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-cyan-400 animate-spin" />
                      <span>Analyzing...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={endRef} className="h-4" />
            </div>

            {/* ── ERROR NOTIFICATION ───────────────────────────────── */}
            {error && (
              <div className="mx-4 mb-2 rounded border border-rose-500/20 bg-rose-500/5 p-2 text-rose-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[12px]">
                    <AlertCircle size={14} className="text-rose-400" />
                    <span>Copilot connection issue.</span>
                    {lastFailedMessage && (
                      <button
                        type="button"
                        onClick={() => submitMessage(undefined, lastFailedMessage)}
                        className="underline text-rose-300 hover:text-rose-100 cursor-pointer"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* ── DOCKED CONSOLE COMPOSER ──────────────────────────── */}
            <div className="shrink-0 p-4 pt-0">
              <form onSubmit={submitMessage} className="relative">
                <div className="flex items-end gap-2 rounded-[20px] border border-white/10 bg-[#151b28] p-1.5 shadow-sm focus-within:border-white/20 transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about this ocean state..."
                    rows={1}
                    maxLength={2000}
                    disabled={isSending}
                    className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-3 py-2 text-[14px] text-white outline-none placeholder:text-slate-500 disabled:opacity-50 font-sans scrollbar-thin"
                    aria-label="Ask OceanStream Copilot"
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={!draft.trim() || isSending}
                    className="flex h-9 w-9 mb-0.5 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Send query"
                  >
                    <ArrowUp size={18} strokeWidth={2.5} />
                  </motion.button>
                </div>
              </form>

              {/* Bottom Hint */}
              <div className="mt-2 text-center text-[11px] text-slate-500">
                Enter to send · Shift+Enter for newline
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}