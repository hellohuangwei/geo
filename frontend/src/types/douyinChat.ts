export type ChatMessageRole = 'user' | 'agent' | 'system' | 'error'

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: string
  timestamp: number
}
