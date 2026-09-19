import { Content, GenerateContentResponse, GoogleGenAI, Type } from '@google/genai';
import {
  AiChatMessage,
  AiMode,
  AiQueryContext,
  DepthComparisonData,
  ScientificContext,
  ToolActionRecord,
  VisualizationAction,
} from '../types/ai.types';
import {
  executeScientificTool,
  ToolExecutionResult,
} from './scientificTools.service';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const SYSTEM_INSTRUCTIONS = `You are OceanStream Copilot, an intelligent scientific assistant embedded inside the OceanStream 3D/4D oceanographic platform.

AUTHORITATIVE SCIENTIFIC ARCHITECTURE:
- Numerical ocean data is supplied either in the initial investigation context or through real OceanStream scientific tools.
- Gemini is NOT the ocean data source; Python/Copernicus/Argo is the source of truth.
- When an inquiry requires querying a different depth, searching nearby Argo floats, extracting float profiles, or comparing multiple depth levels, use the appropriate OceanStream scientific tool.

SCIENTIFIC TRUST & GROUNDING RULES:
1. NEVER invent, hallucinate, or extrapolate numerical ocean measurements. Use ONLY values returned by tools or supplied in context.
2. ABSOLUTE NULL INTEGRITY & TRUTHFULNESS:
   - If a requested parameter (such as pH, pCO₂, chlorophyll, nitrate, etc.) has value null or is missing in the investigation context or tool output, you MUST explicitly state that the measurement is unavailable or not provided in the active dataset.
   - You are STRICTLY FORBIDDEN from generating, calculating, estimating, or hallucinating numerical values for null fields. Never substitute zero or standard oceanic averages for null. null = unavailable.
3. Standard Scientific Units:
   - Temperature: °C
   - Salinity: PSU
   - Velocity: m/s (speed = √(u² + v²))
   - Sea Level: m
   - Dissolved Oxygen: mmol/m³ (μmol/L)
   - Chlorophyll-a: mg/m³
   - Nitrate, Phosphate, Silicate: mmol/m³
   - pH: total scale
   - pCO₂: μatm
4. Scientific Freshness & Provenance:
   - Do NOT use phrases like "real-time", "live streaming", or "instant satellite telemetry".
   - Copernicus ANFC represents daily operational analysis & 10-day numerical forecast cycles (~24-36h assimilation lag).
   - Copernicus Multi-Year represents historical reanalysis (~400-day publication lag).
   - In-situ Argo floats sample along 10-day profiling cycles.
5. Context Continuity:
   - If the user references "here", "this location", or "my current depth", inherit coordinates, depth, and date from the active investigation context.
   - If the user asks "What about 1000 m?", maintain the current lat/lon/date and query 1000 m.
   - If NO location is selected anywhere in context or history, and the user asks a point-specific question, politely ask the user to click or select a location on the 3D globe rather than guessing coordinates.
6. Tone & Audience:
   - Student Mode: Clear, intuitive, engaging, connecting measurements to marine life and ocean depth zones.
   - Scientist Mode: Dense, rigorous technical analysis, quoting exact values, precision, dataset identifiers, and physical limitations.
7. Clean Presentation:
   - Never output internal JSON or function names directly to the user. Present findings in polished Markdown.
8. Tool Efficiency & Termination:
   - When a tool returns 'not_found' or 'unavailable', do not loop trying minor parameter variations. Immediately synthesize your final response, accurately informing the user what was found and what is unavailable.
   - If a float profile is unavailable, report that the vertical profile observations are unavailable and describe the float's known coordinates, distance, and sensor capabilities.
9. EXPLORER VISUALIZATION CONTROL (Safety & Intent):
   - Only call 'set_visualization_state' when the user EXPLICITLY requests navigation or changing the Explorer view (e.g., "Take me to 1000 m", "Set depth to 500 m", "Show the surface", "Move to 10N 75E", "Show September 1, 2026").
   - NEVER call 'set_visualization_state' for purely informational questions (e.g., "What is the temperature at 1000 m?", "How does salinity change?", "Compare 0 and 500 m"). Those must only query scientific data via 'query_ocean_point' or 'compare_ocean_points' without changing Explorer state.
   - For multi-intent queries like "Set this location to 1000 m and tell me the oxygen", execute BOTH 'set_visualization_state(depth: 1000)' and 'query_ocean_point(depth: 1000, ...)' using the target parameters.
   - Never invent coordinates for ambiguous place names. If no coordinate is known, ask the user.`;

const SCIENTIFIC_TOOLS: any = [
  {
    functionDeclarations: [
      {
        name: 'query_ocean_point',
        description:
          'Retrieve real Copernicus physics, biogeochemistry, and nearest Argo float at an ocean coordinate, depth, and date.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            lat: { type: Type.NUMBER, description: 'Latitude in decimal degrees (-90 to 90)' },
            lon: { type: Type.NUMBER, description: 'Longitude in decimal degrees (-180 to 180)' },
            depth: { type: Type.NUMBER, description: 'Depth in meters (0 to 6000, where 0 is surface)' },
            date: { type: Type.STRING, description: 'ISO date string YYYY-MM-DD' },
          },
          required: ['lat', 'lon', 'depth', 'date'],
        },
      },
      {
        name: 'find_nearest_argo',
        description: 'Find real in-situ Argo profiling floats and moorings near an ocean coordinate.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            lat: { type: Type.NUMBER, description: 'Latitude in decimal degrees (-90 to 90)' },
            lon: { type: Type.NUMBER, description: 'Longitude in decimal degrees (-180 to 180)' },
            radius_km: {
              type: Type.NUMBER,
              description: 'Search radius in kilometers (1 to 2000, default 300)',
            },
            type: {
              type: Type.STRING,
              description: "Float type filter: 'core', 'bgc', or 'both'",
            },
          },
          required: ['lat', 'lon'],
        },
      },
      {
        name: 'get_argo_profile',
        description:
          'Retrieve real observed depth-ordered profile measurements (temperature, salinity, oxygen, nitrate, chlorophyll, pH) from an Argo float platform or nearest float.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            platform_number: {
              type: Type.STRING,
              description: "WMO float identifier number (e.g. '2902768')",
            },
            lat: { type: Type.NUMBER, description: 'Latitude if platform_number is not known' },
            lon: { type: Type.NUMBER, description: 'Longitude if platform_number is not known' },
            date: { type: Type.STRING, description: 'ISO date string YYYY-MM-DD' },
          },
        },
      },
      {
        name: 'compare_ocean_points',
        description:
          'Compare real ocean physics and biogeochemistry across 2 to 5 distinct depth levels at a target coordinate and date.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            lat: { type: Type.NUMBER, description: 'Latitude in decimal degrees (-90 to 90)' },
            lon: { type: Type.NUMBER, description: 'Longitude in decimal degrees (-180 to 180)' },
            date: { type: Type.STRING, description: 'ISO date string YYYY-MM-DD' },
            depths: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
              description: 'Array of 2 to 5 distinct depths in meters (0 to 6000), e.g. [0, 500]',
            },
          },
          required: ['lat', 'lon', 'date', 'depths'],
        },
      },
      {
        name: 'set_visualization_state',
        description:
          'Explicitly adjust the active 3D/4D Explorer view (depth level, date, or target ocean coordinates) ONLY when the user explicitly requests navigation or a view change.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            depth: {
              type: Type.NUMBER,
              description: 'Target depth in meters (0 to 6000, where 0 is surface).',
            },
            date: {
              type: Type.STRING,
              description: 'Target ISO date string YYYY-MM-DD.',
            },
            lat: {
              type: Type.NUMBER,
              description: 'Target latitude in decimal degrees (-90 to 90).',
            },
            lon: {
              type: Type.NUMBER,
              description: 'Target longitude in decimal degrees (-180 to 180).',
            },
          },
        },
      },
    ],
  },
];

export class GeminiConfigurationError extends Error {
  constructor() {
    super('Gemini is not configured: GEMINI_API_KEY is missing');
    this.name = 'GeminiConfigurationError';
  }
}

export class GeminiServiceError extends Error {
  constructor(message = 'Gemini could not generate a response') {
    super(message);
    this.name = 'GeminiServiceError';
  }
}

export interface GeneratedAnswerResult {
  answer: string;
  tool_actions: ToolActionRecord[];
  visualization_actions?: VisualizationAction[];
  scientific_data?: ScientificContext;
  comparison_data?: DepthComparisonData;
}


async function callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastErr = error;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[gemini.service] Attempt ${attempt}/${maxAttempts} failed:`, errMsg);

      if (attempt < maxAttempts) {
        let waitMs = attempt * 1500;
        const delayMatch = errMsg.match(/retryDelay"?\s*:\s*"?(\d+)s/i);
        if (delayMatch && delayMatch[1]) {
          waitMs = Math.min((parseInt(delayMatch[1], 10) + 1) * 1000, 10000);
        }
        console.log(`[gemini.service] Waiting ${waitMs}ms before retry attempt ${attempt + 1}...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastErr;
}

export async function generateOceanStreamAnswer(
  message: string,
  mode: AiMode,
  scientificContext: ScientificContext,
  history: AiChatMessage[] = [],
): Promise<GeneratedAnswerResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiConfigurationError();
  }

  const ai = new GoogleGenAI({ apiKey });
  const configuredModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  let activeModel = configuredModel;

  // Build context header
  const contextHeader = [
    `Mode: ${mode}`,
    'Investigation Context (Current Active View):',
    JSON.stringify(scientificContext),
  ].join('\n');

  // Convert conversation history to Gemini content format
  const contents: Content[] = [];

  // Add history messages (keep last 6)
  const recentHistory = history.slice(-6);
  for (const h of recentHistory) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    });
  }

  // Add current prompt
  const currentPrompt = [
    contextHeader,
    '',
    `User query: ${message}`,
  ].join('\n');

  contents.push({
    role: 'user',
    parts: [{ text: currentPrompt }],
  });

  const executedActions: ToolActionRecord[] = [];
  const visualizationActions: VisualizationAction[] = [];
  let updatedScientificData: ScientificContext | undefined = scientificContext;
  let updatedComparisonData: DepthComparisonData | undefined;

  const invokeGenerate = async (reqContents: Content[]): Promise<GenerateContentResponse> => {
    const candidateModels = [
      activeModel,
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    let lastError: unknown;
    for (const mod of candidateModels) {
      try {
        activeModel = mod;
        return await callWithRetry(() =>
          ai.models.generateContent({
            model: mod,
            contents: reqContents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTIONS,
              tools: SCIENTIFIC_TOOLS,
            },
          })
        );
      } catch (err: any) {
        lastError = err;
        console.warn(`[gemini.service] Model '${mod}' request failed, trying next candidate model...`);
      }
    }
    throw lastError;
  };

  const maxTurns = 4;
  let currentTurn = 0;

  try {
    while (currentTurn < maxTurns) {
      currentTurn++;
      const response = await invokeGenerate(contents);
      const functionCalls = response.functionCalls;

      // If no function calls, we have the final text answer
      if (!functionCalls || functionCalls.length === 0) {
        const text = response.text?.trim();
        if (!text) {
          throw new GeminiServiceError('Gemini returned an empty response');
        }
        return {
          answer: text,
          tool_actions: executedActions,
          visualization_actions: visualizationActions,
          scientific_data: updatedScientificData,
          comparison_data: updatedComparisonData,
        };
      }

      // Add model's function-call candidate to contents
      const modelCandidateContent = response.candidates?.[0]?.content;
      if (modelCandidateContent) {
        contents.push(modelCandidateContent);
      }

      const toolResponseParts: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> = [];

      for (const call of functionCalls) {
        const toolName = call.name || 'query_ocean_point';
        const toolArgs = (call.args || {}) as Record<string, unknown>;

        console.log(`[gemini.service] Turn ${currentTurn}: Executing tool '${toolName}' with args:`, toolArgs);

        const toolResult: ToolExecutionResult = await executeScientificTool(toolName, toolArgs);

        executedActions.push({
          tool: toolName,
          status: toolResult.status,
          input: toolArgs,
          summary: toolResult.summary || toolResult.reason,
        });

        if (toolResult.visualization_action) {
          visualizationActions.push(toolResult.visualization_action);
        }
        if (toolResult.scientific_data) {
          updatedScientificData = toolResult.scientific_data;
        }
        if (toolResult.comparison_data) {
          updatedComparisonData = toolResult.comparison_data;
        }

        toolResponseParts.push({
          functionResponse: {
            name: toolName,
            response: {
              tool: toolResult.tool,
              status: toolResult.status,
              data: toolResult.data,
              reason: toolResult.reason,
              summary: toolResult.summary,
            },
          },
        });
      }

      // Push user function-response parts to conversation
      contents.push({
        role: 'user',
        parts: toolResponseParts as any,
      });
    }

    // If turns exhausted, force final synthesis without tools
    console.log('[gemini.service] Max turns reached, synthesizing final response from accumulated tool results...');
    const finalSynth = await callWithRetry(() =>
      ai.models.generateContent({
        model: activeModel,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS,
        },
      })
    );

    const finalText = finalSynth.text?.trim() || 'Scientific analysis completed based on available ocean data.';
    return {
      answer: finalText,
      tool_actions: executedActions,
      visualization_actions: visualizationActions,
      scientific_data: updatedScientificData,
      comparison_data: updatedComparisonData,
    };

  } catch (error) {
    console.error('[gemini.service] Error calling Gemini:', error);
    if (error instanceof GeminiServiceError || error instanceof GeminiConfigurationError) {
      throw error;
    }
    throw new GeminiServiceError(error instanceof Error ? error.message : 'Gemini service error');
  }
}