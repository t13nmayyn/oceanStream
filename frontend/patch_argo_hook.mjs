import { readFileSync, writeFileSync } from 'fs';

let code = readFileSync('c:/ocean/oceanStream/frontend/src/hooks/useArgoFloats.js', 'utf8');

code = code.replace(
  "import { getActiveArgoFloats } from '../services/argoApi';",
  "import { getActiveObservations, getArgoTrajectory, getGliderTrajectory } from '../services/argoApi';"
);

code = code.replace(
  "getActiveArgoFloats(limit)",
  "getActiveObservations()"
);

const oldLogic = `        // Backend returns array of floats or object with floats property
        const rawFloats = Array.isArray(result)
          ? result
          : result?.floats || result?.data || [];

        if (rawFloats.length > 0) {
          const normalized = rawFloats
            .map(normalizeArgoFloat)
            .filter((f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng));

          if (normalized.length > 0) {
            setFloats(normalized);
            setIsLive(true);

            dispatch({
              type: 'ADD_LOG',
              payload: {
                type: 'info',
                text: \`\${new Date().toISOString().slice(11, 19)} [ARGO] \${normalized.length} live floats loaded from backend\`,
              },
            });
          } else {
            setFloats([]);
            setIsLive(false);
          }
        } else {
          setFloats([]);
          setIsLive(false);
        }`;

const newLogic = `        const rawFloats = result?.observations || result?.floats || result?.data || [];
        if (rawFloats.length > 0) {
          Promise.all(rawFloats.map(async (raw) => {
            let traj = [];
            try {
              if (raw.platform_type === 'Glider' || raw.source === 'ioos_glider' || raw.type === 'glider') {
                 const res = await getGliderTrajectory(raw.platform_id || raw.id || raw.dataset_id);
                 traj = res.trajectory || [];
              } else {
                 const res = await getArgoTrajectory(raw.platform_number || raw.platform_id || raw.id);
                 traj = res.trajectory || [];
              }
            } catch(e) {}
            return { ...raw, trajectory: traj };
          })).then(floatsWithTraj => {
             if (!isMounted) return;
             const normalized = floatsWithTraj.map(normalizeArgoFloat).filter(f => f.lat && f.lng);
             setFloats(normalized);
             setIsLive(true);
          });
        } else {
          setFloats([]);
          setIsLive(false);
        }`;

code = code.replace(oldLogic, newLogic);

code = code.replace(
  "    type,\n    lat: raw.lat || raw.latitude,",
  "    type,\n    trajectory: raw.trajectory || [],\n    lat: raw.lat || raw.latitude,"
);

writeFileSync('c:/ocean/oceanStream/frontend/src/hooks/useArgoFloats.js', code, 'utf8');
console.log('Updated useArgoFloats.js');
