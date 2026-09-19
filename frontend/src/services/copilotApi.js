import { NODE_API_BASE } from '../config/api';

/** Send a user question to the server-side OceanStream Copilot. */
export async function sendCopilotMessage({ message, mode, context, history = [] }) {
  let response;

  try {
    response = await fetch(`${NODE_API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mode, context, history }),
    });
  } catch {
    throw new Error('Copilot is unreachable. Check that the OceanStream gateway is running.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Copilot returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Copilot request failed (${response.status}).`);
  }

  if (!payload || typeof payload.answer !== 'string' || !payload.answer.trim()) {
    throw new Error('Copilot returned an incomplete response.');
  }

  return {
    answer: payload.answer.trim(),
    mode: payload.mode,
    queryContext: payload.query_context,
    dataSource: payload.data_source,
    scientificDataStatus: payload.scientific_data_status,
    scientificData: payload.scientific_data,
    toolActions: payload.tool_actions || [],
    comparisonData: payload.comparison_data || null,
    visualizationActions: payload.visualization_actions || [],
  };
}