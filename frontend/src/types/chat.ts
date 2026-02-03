// --- Blocks ---

export interface ThinkingBlock {
  id: string
  type: 'thinking'
  content: string
}

export interface TextBlock {
  id: string
  type: 'text'
  content: string
}

export interface ToolCallBlock {
  id: string
  type: 'tool_call'
  name: string
  args: Record<string, unknown>
  result: string | null
  status: 'running' | 'done'
}

export interface PlotlyBlock {
  id: string
  type: 'plotly'
  json: PlotlyJSON | string
}

export interface DataTableBlock {
  id: string
  type: 'data_table'
  json: DataTableJSON | string
}

export interface ErrorBlock {
  id: string
  type: 'error'
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

export interface SSEEvent {
  type: string
  data: Record<string, unknown>
}
