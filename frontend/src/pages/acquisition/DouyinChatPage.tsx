import { useEffect, useRef } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDouyinChatStore } from '@/stores/douyinChatStore'
import { ChatMessage } from './components/ChatMessage'
import { ChatInput } from './components/ChatInput'
import { ProgressLog } from './components/ProgressLog'
import { AgentMarkdown } from '@/components/AgentMarkdown'

const WELCOME_SUGGESTIONS = [
  '帮我采集100条小龙虾的评论',
  '采集200条火锅相关的评论',
  '帮我找50条美妆产品的用户反馈',
  '采集100条旅游攻略的评论',
]

/** 流式打字中的 agent 气泡 */
function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-white shadow-[0_2px_6px_rgba(139,195,74,0.3)]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="max-w-[85%] rounded-[14px] rounded-bl-[6px] bg-[var(--fill-tertiary)] px-4 py-3">
        <AgentMarkdown className="agent-markdown text-[14px] leading-relaxed text-[var(--ink)]">
          {content}
        </AgentMarkdown>
        {/* 打字光标 */}
        <span className="inline-block w-[2px] h-[16px] bg-[var(--accent)] animate-pulse align-middle ml-[1px]" />
      </div>
    </div>
  )
}

export function DouyinChatPage() {
  const messages = useDouyinChatStore((s) => s.messages)
  const isSending = useDouyinChatStore((s) => s.isSending)
  const streamingContent = useDouyinChatStore((s) => s.streamingContent)
  const cdpReady = useDouyinChatStore((s) => s.cdpReady)
  const bridgeConnected = useDouyinChatStore((s) => s.bridgeConnected)
  const douyinLoggedIn = useDouyinChatStore((s) => s.douyinLoggedIn)
  const relayConnected = useDouyinChatStore((s) => s.relayConnected)
  const progressMessages = useDouyinChatStore((s) => s.progressMessages)
  const sendMessage = useDouyinChatStore((s) => s.sendMessage)
  const clearChat = useDouyinChatStore((s) => s.clearChat)
  const connectBridge = useDouyinChatStore((s) => s.connectBridge)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 挂载时：检查 CDP → 连接 Bridge → 连接 Relay
  useEffect(() => {
    const cleanup = connectBridge()
    return cleanup
  }, [connectBridge])

  // 消息变化 / 流式内容变化时自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const isEmpty = messages.length === 0 && !streamingContent

  return (
    <div className="flex h-[calc(100vh-65px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--card)] px-6 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <span className={cn(
              'h-2.5 w-2.5 rounded-full',
              douyinLoggedIn ? 'bg-[var(--accent)] animate-pulse'
                : bridgeConnected ? 'bg-[var(--orange)]'
                : cdpReady ? 'bg-[var(--ink-2)]'
                : 'bg-[var(--ink-3)]',
            )} />
            <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--ink)]">AI 抖音获客</h1>

            {/* 连接状态 */}
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              !cdpReady ? 'bg-[var(--fill-tertiary)] text-[var(--ink-3)]'
                : !bridgeConnected ? 'bg-[rgba(244,169,75,0.12)] text-[var(--orange)]'
                : !douyinLoggedIn ? 'bg-[rgba(244,169,75,0.12)] text-[var(--orange)]'
                : 'bg-[rgba(139,195,74,0.12)] text-[var(--accent-d)]',
            )}>
              {!cdpReady ? 'CDP 未开启'
                : !bridgeConnected ? 'Bridge 连接中...'
                : !douyinLoggedIn ? '待登录抖音'
                : relayConnected ? '已就绪'
                : '就绪(离线模式)'}
            </span>
            {isSending && (
              <span className="rounded-full bg-[rgba(139,195,74,0.12)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-d)]">
                <Loader2 className="mr-1 inline-block h-3 w-3 animate-spin" />
                处理中
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[var(--ink-2)]">用自然语言描述采集需求，智能体会自动执行</p>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <button onClick={clearChat}
              className="h-9 rounded-[10px] border border-[var(--line)] px-3 text-[12px] text-[var(--ink-2)] hover:bg-[var(--fill-tertiary)] transition-colors">
              清空对话
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--accent-soft)]">
              <Sparkles className="h-8 w-8 text-[var(--accent-d)]" />
            </div>
            <h2 className="mt-5 text-[18px] font-bold text-[var(--ink)]">AI 抖音获客助手</h2>
            <p className="mt-2 max-w-[440px] text-center text-[13px] leading-relaxed text-[var(--ink-2)]">
              用自然语言描述采集需求，智能体会帮你完成抖音评论采集和分析。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-[500px]">
              {WELCOME_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => sendMessage(s)} disabled={isSending}
                  className="rounded-[10px] border border-[var(--line)] px-3.5 py-2 text-[12px] text-[var(--ink-2)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-d)] hover:border-[var(--accent)]/30 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-[780px] mx-auto">
            {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
            {/* 流式打字中的实时气泡 */}
            {streamingContent && <StreamingBubble content={streamingContent} />}
            <ProgressLog messages={progressMessages} isActive={isSending} />
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput onSend={sendMessage} disabled={isSending} />
    </div>
  )
}
