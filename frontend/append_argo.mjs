import { readFileSync, writeFileSync } from 'fs';

let code = readFileSync('c:/ocean/oceanStream/frontend/src/services/argoApi.js', 'utf8');

if (!code.includes('getArgoTrajectory')) {
  code += `
/**
 * Fetch spatial-temporal trajectory of an Argo float.
 */
export async function getArgoTrajectory(platformNumber) {
  try {
    const res = await fetch(\`\${API_BASE}/argo/trajectory?platform_number=\${platformNumber}\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return await res.json();
  } catch (err) {
    console.warn('[argoApi] getArgoTrajectory unavailable:', err.message);
    return { status: 'unavailable', trajectory: [] };
  }
}

/**
 * Fetch spatial-temporal trajectory of a glider.
 */
export async function getGliderTrajectory(datasetId, server = null) {
  const params = new URLSearchParams({ dataset_id: datasetId });
  if (server) params.append('server', server);
  try {
    const res = await fetch(\`\${API_BASE}/glider/trajectory?\${params.toString()}\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return await res.json();
  } catch (err) {
    console.warn('[argoApi] getGliderTrajectory unavailable:', err.message);
    return { status: 'unavailable', trajectory: [] };
  }
}

/**
 * Fetch all active observations (gliders + floats) in region
 */
export async function getActiveObservations(bounds = null) {
  try {
    const params = new URLSearchParams();
    if (bounds) {
       params.append('lat_min', bounds.south);
       params.append('lat_max', bounds.north);
       params.append('lon_min', bounds.west);
       params.append('lon_max', bounds.east);
    }
    const res = await fetch(\`\${API_BASE}/observation/active?\${params.toString()}\`);
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return await res.json();
  } catch (err) {
    console.warn('[argoApi] getActiveObservations unavailable:', err.message);
    return { status: 'unavailable', observations: [] };
  }
}
`;
  writeFileSync('c:/ocean/oceanStream/frontend/src/services/argoApi.js', code, 'utf8');
  console.log('Appended wrappers to argoApi.js');
}
