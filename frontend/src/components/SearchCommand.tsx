import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Hash, FileText, Package, CornerDownLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchTopicsApi, type TopicItem } from '@/api/topics'
import { fetchArticlesApi, type GeneratedArticle } from '@/api/articles'
import { fetchProductProfilesApi, type ProductProfile } from '@/api/productProfile'

interface SearchResult {
  type: 'topic' | 'article' | 'product' | 'page'
  label: string
  sublabel?: string
  to: string
}

const QUICK_PAGES: SearchResult[] = [
  { type: 'page', label: '数据看板', sublabel: 'Dashboard', to: '/dashboard' },
  { type: 'page', label: '品牌可见度', sublabel: 'AI 监测', to: '/monitor/brand-visibility' },
  { type: 'page', label: '引用分析', sublabel: 'AI 监测', to: '/monitor/citation-analysis' },
  { type: 'page', label: '竞品分析', sublabel: 'AI 监测', to: '/monitor/scene-questions' },
  { type: 'page', label: 'AI 快照', sublabel: 'AI 监测', to: '/monitor/ai-snapshot' },
  { type: 'page', label: '品牌情感', sublabel: 'AI 监测', to: '/monitor/brand-sentiment' },
  { type: 'page', label: '内容管理', sublabel: 'AI 内容', to: '/content/management' },
  { type: 'page', label: '创建文章', sublabel: 'AI 内容', to: '/content/create' },
  { type: 'page', label: '品牌画像', sublabel: '设置', to: '/settings/brand-profile' },
  { type: 'page', label: '产品画像', sublabel: '设置', to: '/settings/product-profile' },
  { type: 'page', label: '话题设置', sublabel: '设置', to: '/settings/topics' },
  { type: 'page', label: '知识库', sublabel: '设置', to: '/knowledge-base' },
]

const typeIcon: Record<string, React.ReactNode> = {
  topic: <Hash className="h-3.5 w-3.5" />,
  article: <FileText className="h-3.5 w-3.5" />,
  product: <Package className="h-3.5 w-3.5" />,
  page: <CornerDownLeft className="h-3.5 w-3.5" />,
}

const typeColor: Record<string, string> = {
  topic: 'var(--purple)',
  article: 'var(--accent-d)',
  product: 'var(--blue)',
  page: 'var(--ink-2)',
}

export function SearchCommand() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [topics, setTopics] = useState<TopicItem[]>([])
  const [articles, setArticles] = useState<GeneratedArticle[]>([])
  const [products, setProducts] = useState<ProductProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)

  /* Load data once on first open */
  const loadData = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try {
      const [t, a, p] = await Promise.all([
        fetchTopicsApi().catch(() => [] as TopicItem[]),
        fetchArticlesApi(1, 50).catch(() => ({ items: [] as GeneratedArticle[] })),
        fetchProductProfilesApi().catch(() => [] as ProductProfile[]),
      ])
      setTopics(t)
      setArticles('items' in a ? a.items : [])
      setProducts(p)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  /* Close on click outside */
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  /* Ctrl+K shortcut */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  /* Build results from loaded data + query */
  const results: SearchResult[] = (() => {
    const q = query.trim().toLowerCase()

    /* Quick pages — always show when no query, or filter when query */
    const pageResults = QUICK_PAGES.filter(
      (p) => !q || p.label.toLowerCase().includes(q) || (p.sublabel && p.sublabel.toLowerCase().includes(q)),
    ).slice(0, q ? 4 : 3)

    if (!q) {
      return [
        ...pageResults,
        ...topics.filter(t => t.enabled).slice(0, 3).map(t => ({
          type: 'topic' as const, label: t.name, sublabel: `${t.sceneQuestions?.length || 0} 个场景问题`, to: '/settings/topics',
        })),
        ...articles.slice(0, 3).map(a => ({
          type: 'article' as const, label: a.title, sublabel: a.topic, to: `/content/articles/${a.id}`,
        })),
      ]
    }

    const topicResults: SearchResult[] = topics
      .filter(t => t.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(t => ({ type: 'topic', label: t.name, sublabel: `${t.sceneQuestions?.length || 0} 个场景问题`, to: '/settings/topics' }))

    const articleResults: SearchResult[] = articles
      .filter(a => a.title.toLowerCase().includes(q) || (a.topic && a.topic.toLowerCase().includes(q)))
      .slice(0, 5)
      .map(a => ({ type: 'article', label: a.title, sublabel: a.topic, to: `/content/articles/${a.id}` }))

    const productResults: SearchResult[] = products
      .filter(p => (p.productName || '').toLowerCase().includes(q))
      .slice(0, 5)
      .map(p => ({ type: 'product', label: p.productName || '未命名', sublabel: p.applicableScenarios || undefined, to: `/settings/product-profile/${p.id}` }))

    return [...pageResults, ...topicResults, ...articleResults, ...productResults]
  })()

  /* Reset active index on query change */
  useEffect(() => { setActiveIdx(0) }, [query])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    navigate(result.to)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault()
      handleSelect(results[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-[440px]">
      {/* Search trigger */}
      <div
        className="topbar-search cursor-text"
        onClick={() => { setOpen(true); loadData(); setTimeout(() => inputRef.current?.focus(), 50) }}
      >
        <Search className="w-4 h-4 shrink-0" strokeWidth={1.8} />
        <input
          ref={inputRef}
          placeholder="搜索品牌、问题或文章..."
          aria-label="搜索"
          className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-3)] font-medium"
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!open) { setOpen(true); loadData() } }}
          onFocus={() => { setOpen(true); loadData() }}
          onKeyDown={handleKeyDown}
        />
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-[6px] bg-[var(--fill-tertiary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-3)] tracking-[0.02em]">
          ⌘K
        </kbd>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1.5 left-0 right-0 z-50 rounded-[14px] bg-[var(--card)] border border-[var(--line)] shadow-[0_8px_30px_rgba(0,0,0,0.10)] overflow-hidden">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-3)]" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-[var(--ink-3)]">未找到结果</p>
              <p className="text-[11px] text-[var(--ink-3)]/60 mt-0.5">尝试其他关键词</p>
            </div>
          ) : (
            <>
              {/* Results list */}
              <div className="py-2 max-h-[360px] overflow-y-auto">
                {results.map((r, i) => (
                  <button
                    key={`${r.type}-${r.label}-${i}`}
                    className={cn(
                      'w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors',
                      i === activeIdx ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--fill-quaternary)]',
                    )}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <span
                      className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                      style={{ background: `${typeColor[r.type]}15`, color: typeColor[r.type] }}
                    >
                      {typeIcon[r.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[var(--ink)] truncate">{r.label}</div>
                      {r.sublabel && (
                        <div className="text-[11px] text-[var(--ink-3)] truncate">{r.sublabel}</div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--ink-3)]/50 shrink-0">
                      {r.type === 'topic' ? '话题' : r.type === 'article' ? '文章' : r.type === 'product' ? '产品' : '页面'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Footer hint */}
              <div className="border-t border-[var(--line)] px-4 py-2 flex items-center gap-4 text-[10px] text-[var(--ink-3)]/60">
                <span className="flex items-center gap-1"><kbd className="rounded-[4px] bg-[var(--fill-tertiary)] px-1 py-0.5 text-[9px] font-semibold">↑↓</kbd> 导航</span>
                <span className="flex items-center gap-1"><kbd className="rounded-[4px] bg-[var(--fill-tertiary)] px-1 py-0.5 text-[9px] font-semibold">↵</kbd> 选择</span>
                <span className="flex items-center gap-1"><kbd className="rounded-[4px] bg-[var(--fill-tertiary)] px-1 py-0.5 text-[9px] font-semibold">Esc</kbd> 关闭</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
