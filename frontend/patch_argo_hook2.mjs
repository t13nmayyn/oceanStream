import { readFileSync, writeFileSync } from 'fs';
let code = readFileSync('c:/ocean/oceanStream/frontend/src/hooks/useArgoFloats.js', 'utf8');

code = code.replace(
  "depth: raw.max_depth ? `${raw.max_depth} m` : '2,000 m',",
  "depth: raw.depth_m || raw.depth || (raw.max_depth ? parseFloat(raw.max_depth) : 50),\n    trajectory: raw.trajectory || [],"
);

writeFileSync('c:/ocean/oceanStream/frontend/src/hooks/useArgoFloats.js', code, 'utf8');
console.log('Fixed useArgoFloats.js parsing');
