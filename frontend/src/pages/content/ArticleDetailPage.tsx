import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchArticleApi, type GeneratedArticle } from '@/api/articles'
import { Button } from '@/components/ui/button'
import { Calendar, Package, Loader2, Pencil, ArrowLeft } from 'lucide-react'
import { renderMd } from '@/lib/utils'

export function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [article, setArticle] = useState<GeneratedArticle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (!id) return; fetchArticleApi(Number(id)).then(setArticle).catch(() => navigate('/content/management')).finally(() => setLoading(false)) }, [id, navigate])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-3)]" />
    </div>
  )
  if (!article) return null

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/content/management')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors mb-3">
            <ArrowLeft className="h-3.5 w-3.5" />返回列表
          </button>
          <h1 className="text-[24px] font-extrabold text-[var(--ink)] tracking-[-0.02em] leading-[1.2]">{article.title}</h1>
        </div>
        <Button onClick={() => navigate(`/content/articles/${id}/edit`)}
          className="h-10 gap-2 rounded-[12px] text-[14px] font-semibold shrink-0">
          <Pencil className="h-4 w-4" />编辑
        </Button>
      </div>

      {/* Meta card */}
      <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-6 text-[13px]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] bg-[var(--fill-tertiary)] grid place-items-center">
              <Calendar className="h-4 w-4 text-[var(--ink-2)]" strokeWidth={1.7} />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-[0.04em]">创建时间</div>
              <div className="text-[13px] font-semibold text-[var(--ink)]">{article.createTime?.substring(0, 10)}</div>
            </div>
          </div>
          {article.product && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-[10px] bg-[var(--fill-tertiary)] grid place-items-center">
                <Package className="h-4 w-4 text-[var(--ink-2)]" strokeWidth={1.7} />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-[0.04em]">产品</div>
                <div className="text-[13px] font-semibold text-[var(--ink)]">{article.product}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center h-7 px-3 rounded-[8px] text-[11px] font-semibold bg-[var(--accent-soft)] text-[var(--accent-d)]">
              {article.topic}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-8 shadow-[var(--shadow-card)]">
        <article
          className="prose max-w-none
            prose-headings:text-[var(--ink)] prose-headings:font-bold
            prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-5
            prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-4
            prose-p:text-[15px] prose-p:leading-[1.75] prose-p:text-[var(--ink)]/85 prose-p:my-4
            prose-li:text-[14px] prose-li:leading-[1.7] prose-li:my-1
            prose-strong:text-[var(--ink)] prose-strong:font-semibold
            prose-a:text-[var(--accent-d)]
            [&_ul]:my-5 [&_ol]:my-5 [&_blockquote]:border-l-[var(--accent)] [&_blockquote]:bg-[var(--fill-quaternary)] [&_blockquote]:rounded-r-[12px] [&_blockquote]:py-3 [&_blockquote]:px-5"
          dangerouslySetInnerHTML={{ __html: renderMd(article.content) }} />
      </div>
    </div>
  )
}
