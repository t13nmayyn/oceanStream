import { Request, Response } from 'express';
import { fetchOceanPoint, UpstreamError } from '../services/pythonOcean.service';
import {
  generateOceanStreamAnswer,
  GeminiConfigurationError,
  GeminiServiceError,
} from '../services/gemini.service';
import {
  AiChatMessage,
  AiChatRequest,
  AiChatResponse,
  AiMode,
  AiQueryContext,
  ScientificContext,
} from '../types/ai.types';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function normalizeContext(raw: AiChatRequest['context']): AiQueryContext {
  return {
    lat: isFiniteNumber(raw?.lat) ? raw.lat : null,
    lon: isFiniteNumber(raw?.lon) ? raw.lon : null,
    depth: isFiniteNumber(raw?.depth) ? raw.depth : null,
    date: typeof raw?.date === 'string' && raw.date.trim() ? raw.date.trim() : null,
  };
}

function validPoint(context: AiQueryContext): boolean {
  return context.lat !== null && context.lon !== null &&
    context.lat >= -90 && context.lat <= 90 &&
    context.lon >= -180 && context.lon <= 180 &&
    (context.depth === null || (context.depth >= 0 && context.depth <= 6000));
}

function pickNumbers(
  source: Record<string, unknown> | undefined,
  fields: string[],
): Record<string, number | null> | undefined {
  if (!source) return undefined;
  return Object.fromEntries(fields.map((field) => [
    field,
    isFiniteNumber(source[field]) ? source[field] : null,
  ]));
}

function buildScientificContext(
  query: AiQueryContext,
  point: Record<string, unknown> | undefined,
  unavailableReason?: string,
): ScientificContext {
  const context: ScientificContext = { query };
  if (point?.physics && typeof point.physics === 'object') {
    context.physics = pickNumbers(point.physics as Record<string, unknown>, [
      'temperature_c', 'salinity_psu', 'current_u_ms', 'current_v_ms', 'sea_level_m',
    ]);
  }
  if (point?.bgc && typeof point.bgc === 'object') {
    context.bgc = pickNumbers(point.bgc as Record<string, unknown>, [
      'chlorophyll_mgl', 'nitrate_mmolm3', 'phosphate_mmolm3', 'silicate_mmolm3',
      'oxygen_mmolm3', 'ph', 'pco2_uatm',
    ]);
  }
  if (point?.nearest_argo_float && typeof point.nearest_argo_float === 'object') {
    const argo = point.nearest_argo_float as Record<string, unknown>;
    context.nearest_argo_float = Object.fromEntries(
      ['platform_number', 'distance_km', 'type', 'available_variables', 'last_date', 'source']
        .filter((field) => argo[field] !== undefined)
        .map((field) => [field, argo[field]]),
    );
  }
  if (point?.dataset_info && typeof point.dataset_info === 'object') {
    const info = point.dataset_info as Record<string, unknown>;
    context.dataset_info = Object.fromEntries(
      ['date', 'is_recent', 'phy_dataset', 'bgc_dataset', 'product_type', 'cutoff_date', 'lag_days']
        .filter((field) => info[field] !== undefined)
        .map((field) => [field, info[field]]),
    );
  }
  if (unavailableReason) context.availability_note = unavailableReason;
  return context;
}

function sanitizeHistory(rawHistory: unknown): AiChatMessage[] {
  if (!Array.isArray(rawHistory)) return [];
  const valid: AiChatMessage[] = [];
  for (const item of rawHistory) {
    if (
      item &&
      typeof item === 'object' &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.content === 'string' &&
      item.content.trim()
    ) {
      valid.push({
        role: item.role,
        content: item.content.trim(),
      });
    }
  }
  return valid.slice(-10);
}

export async function postAiChat(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<AiChatRequest> | undefined;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const mode = body?.mode;

  if (!message || (mode !== 'student' && mode !== 'scientist')) {
    res.status(400).json({ error: 'Request requires a non-empty message and mode: student or scientist' });
    return;
  }

  const queryContext = normalizeContext(body?.context);
  const history = sanitizeHistory(body?.history);

  let point: Record<string, unknown> | undefined;
  let dataStatus: AiChatResponse['scientific_data_status'] = 'not_requested';
  let unavailableReason: string | undefined;

  if (validPoint(queryContext)) {
    try {
      const upstreamPoint = await fetchOceanPoint({
        lat: queryContext.lat as number,
        lon: queryContext.lon as number,
        depth: queryContext.depth ?? 0,
        date: queryContext.date ?? undefined,
      });
      point = upstreamPoint as unknown as Record<string, unknown>;
      if (upstreamPoint.status === 'ok') {
        dataStatus = 'available';
      } else {
        dataStatus = 'unavailable';
        unavailableReason = 'The selected scientific point is still being fetched or is unavailable. Do not provide numerical point values.';
      }
    } catch (error) {
      dataStatus = 'unavailable';
      unavailableReason = 'The Python scientific backend is unavailable. Answer general questions, but do not provide numerical point values.';
      if (!(error instanceof UpstreamError)) console.error('[gateway] Unexpected scientific upstream error:', error);
    }
  } else if (queryContext.lat !== null || queryContext.lon !== null) {
    dataStatus = 'unavailable';
    unavailableReason = 'The supplied point context is invalid or incomplete. Do not provide numerical point values.';
  }

  const initialScientificContext = buildScientificContext(queryContext, point, unavailableReason);

  try {
    const result = await generateOceanStreamAnswer(
      message,
      mode as AiMode,
      initialScientificContext,
      history,
    );

    const activeScientificData = result.scientific_data || (dataStatus === 'available' ? initialScientificContext : undefined);
    const finalDataStatus = activeScientificData?.physics || activeScientificData?.bgc ? 'available' : dataStatus;

    const response: AiChatResponse = {
      answer: result.answer,
      mode: mode as AiMode,
      query_context: queryContext,
      scientific_data_status: finalDataStatus,
    };

    if (activeScientificData) {
      response.scientific_data = activeScientificData;
    }

    if (result.tool_actions && result.tool_actions.length > 0) {
      response.tool_actions = result.tool_actions;
    }

    if (result.visualization_actions && result.visualization_actions.length > 0) {
      response.visualization_actions = result.visualization_actions;
    }

    if (result.comparison_data) {
      response.comparison_data = result.comparison_data;
    }

    if (point?.cache || point?.dataset_info) {
      const datasetInfo = point.dataset_info as Record<string, unknown> | undefined;
      response.data_source = {};
      if (typeof datasetInfo?.phy_dataset === 'string') response.data_source.dataset = datasetInfo.phy_dataset;
      if (typeof point.cache === 'string') response.data_source.cache = point.cache;
    }

    res.json(response);
  } catch (error: any) {
    if (error instanceof GeminiConfigurationError) {
      res.status(503).json({ error: 'AI service is not configured', details: 'Set GEMINI_API_KEY on the Node server' });
      return;
    }
    if (error instanceof GeminiServiceError) {
      res.status(502).json({ error: 'AI service unavailable', details: error.message });
      return;
    }
    console.error('[gateway] Unexpected AI error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
}