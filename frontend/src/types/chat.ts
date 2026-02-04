// --- Enums ---

export enum SSEEventType {
  THINKING = 'thinking',
  TEXT = 'text',
  TOOL_CALL_START = 'tool_call_start',
  TOOL_CALL_RESULT = 'tool_call_result',
  PLOTLY = 'plotly',
  DATA_TABLE = 'data_table',
  DONE = 'done',
  ERROR = 'error',
}

export enum BlockType {
  THINKING = 'thinking',
  TEXT = 'text',
  TOOL_CALL = 'tool_call',
  PLOTLY = 'plotly',
  DATA_TABLE = 'data_table',
  ERROR = 'error',
}

export enum ToolCallStatus {
  RUNNING = 'running',
  DONE = 'done',
}

// --- Blocks ---

export interface ThinkingBlock {
  id: string
  type: BlockType.THINKING
  content: string
}

export interface TextBlock {
  id: string
  type: BlockType.TEXT
  content: string
}

export interface ToolCallBlock {
  id: string
  type: BlockType.TOOL_CALL
  name: string
  args: Record<string, unknown>
  result: string | null
  status: ToolCallStatus
}

export interface PlotlyBlock {
  id: string
  type: BlockType.PLOTLY
  json: PlotlyJSON | string
}

export interface DataTableBlock {
  id: string
  type: BlockType.DATA_TABLE
  json: DataTableJSON | string
}

export interface ErrorBlock {
  id: string
  type: BlockType.ERROR
  message: string
}

export type Block = ThinkingBlock | TextBlock | ToolCallBlock | PlotlyBlock | DataTableBlock | ErrorBlock

// Distributive Omit that preserves discriminated unions
export type BlockWithoutId = {
  [K in Block['type']]: Omit<Extract<Block, { type: K }>, 'id'>
}[Block['type']]

// --- Messages ---

export interface UserMessage {
  id: string
  role: 'user'
  content: string
}

export interface AssistantMessage {
  id: string
  role: 'assistant'
  blocks: Block[]
}

export type Message = UserMessage | AssistantMessage

// --- Data ---

export interface PlotlyJSON {
  data: Record<string, unknown>[]
  layout: Record<string, unknown>
}

export interface DataTableJSON {
  columns: string[]
  data: (string | number | null)[][]
}

// --- SSE ---

interface SSEThinkingEvent {
  type: SSEEventType.THINKING
  data: { content: string }
}

interface SSETextEvent {
  type: SSEEventType.TEXT
  data: { content: string }
}

interface SSEToolCallStartEvent {
  type: SSEEventType.TOOL_CALL_START
  data: { name: string; args: Record<string, unknown> }
}

interface SSEToolCallResultEvent {
  type: SSEEventType.TOOL_CALL_RESULT
  data: { result: string }
}

interface SSEPlotlyEvent {
  type: SSEEventType.PLOTLY
  data: { json: string }
}

interface SSEDataTableEvent {
  type: SSEEventType.DATA_TABLE
  data: { json: string }
}

interface SSEDoneEvent {
  type: SSEEventType.DONE
  data: Record<string, never>
}

interface SSEErrorEvent {
  type: SSEEventType.ERROR
  data: { message: string }
}

export type SSEEvent =
  | SSEThinkingEvent
  | SSETextEvent
  | SSEToolCallStartEvent
  | SSEToolCallResultEvent
  | SSEPlotlyEvent
  | SSEDataTableEvent
  | SSEDoneEvent
  | SSEErrorEvent
