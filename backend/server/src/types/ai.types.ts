export type AiMode = 'student' | 'scientist';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiQueryContext {
  lat: number | null;
  lon: number | null;
  depth: number | null;
  date: string | null;
}

export interface AiChatRequest {
  message: string;
  mode: AiMode;
  context?: Partial<AiQueryContext> | null;
  history?: AiChatMessage[] | null;
}

export interface ToolActionRecord {
  tool: string;
  status: 'success' | 'unavailable' | 'not_found' | 'error';
  input?: Record<string, unknown>;
  summary?: string;
}

export interface ComparisonRow {
  variable: string;
  label: string;
  unit: string;
  values: Record<number, number | null>;
}

export interface DepthComparisonData {
  lat: number;
  lon: number;
  date: string;
  depths: number[];
  rows: ComparisonRow[];
}

export interface ScientificContext {
  query: AiQueryContext;
  physics?: Record<string, number | null>;
  bgc?: Record<string, number | null>;
  nearest_argo_float?: Record<string, unknown>;
  dataset_info?: Record<string, unknown>;
  availability_note?: string;
}

export interface VisualizationAction {
  type: 'set_visualization_state';
  payload: {
    depth?: number;
    date?: string;
    lat?: number;
    lon?: number;
  };
  summary?: string;
}

export interface AiChatResponse {
  answer: string;
  mode: AiMode;
  query_context: AiQueryContext;
  data_source?: {
    dataset?: string;
    cache?: string;
  };
  scientific_data_status: 'available' | 'unavailable' | 'not_requested';
  scientific_data?: ScientificContext;
  tool_actions?: ToolActionRecord[];
  comparison_data?: DepthComparisonData;
  visualization_actions?: VisualizationAction[];
}