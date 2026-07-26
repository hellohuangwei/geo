import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * 智能体回复专用的 Markdown 渲染组件。
 *
 * ChatMessage 和 DouyinChatPage (StreamingBubble) 共用此组件，
 * 统一表格、标题、代码块等元素的样式。
 */
export function AgentMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── 表格 ──
          table: ({ children }) => (
            <div className="md-table-wrapper">
              <table className="md-table">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="md-thead">{children}</thead>,
          tbody: ({ children }) => <tbody className="md-tbody">{children}</tbody>,
          tr: ({ children }) => <tr className="md-tr">{children}</tr>,
          th: ({ children }) => <th className="md-th">{children}</th>,
          td: ({ children }) => <td className="md-td">{children}</td>,

          // ── 标题 ──
          h1: ({ children }) => <h3 className="md-h1">{children}</h3>,
          h2: ({ children }) => <h3 className="md-h1">{children}</h3>,
          h3: ({ children }) => <h4 className="md-h2">{children}</h4>,
          h4: ({ children }) => <h4 className="md-h2">{children}</h4>,

          // ── 段落 ──
          p: ({ children }) => <p className="md-p">{children}</p>,

          // ── 列表 ──
          ul: ({ children }) => <ul className="md-ul">{children}</ul>,
          ol: ({ children }) => <ol className="md-ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{children}</li>,

          // ── 代码 ──
          code: ({ className: codeClassName, children, ...props }: any) => {
            const isInline = !codeClassName
            return isInline
              ? <code className="md-code-inline" {...props}>{children}</code>
              : <code className="md-code-block" {...props}>{children}</code>
          },
          pre: ({ children }) => <pre className="md-pre">{children}</pre>,

          // ── 强调 ──
          strong: ({ children }) => <strong className="md-strong">{children}</strong>,
          em: ({ children }) => <em className="md-em">{children}</em>,

          // ── 链接 ──
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">
              {children}
            </a>
          ),

          // ── 分割线 ──
          hr: () => <hr className="md-hr" />,

          // ── 引用 ──
          blockquote: ({ children }) => (
            <blockquote className="md-blockquote">{children}</blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
