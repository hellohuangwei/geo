import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PublishDialog } from '@/components/PublishDialog'
import {
  fetchArticlesApi,
  deleteArticleApi,
  batchDeleteArticlesApi,
  batchPublishApi,
  publishArticleApi,
  fetchPublishHistoryApi,
  type GeneratedArticle,
  type PublishHistoryItem,
} from '@/api/articles'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { ContentCard } from '@/components/ContentCard'
import {
  Plus,
  Pencil,
  Send,
  Trash2,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  ExternalLink,
  Clock,
  Eye,
  MoreHorizontal,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function ContentManagementPage() {
  const navigate = useNavigate()
  const [articles, setArticles] = useState<GeneratedArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [publishTarget, setPublishTarget] = useState<{
    ids: number[]
    title: string
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number
    title: string
  } | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [tab, setTab] = useState<'articles' | 'history'>('articles')
  const [history, setHistory] = useState<PublishHistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const pageSize = 8
  const historyPageSize = 8

  const loadArticles = (p: number) => {
    setLoading(true)
    fetchArticlesApi(p, pageSize)
      .then((res) => {
        setArticles(res.items)
        setTotalPages(res.totalPages)
        setTotal(res.total)
        setPage(res.page)
        setSelected(new Set())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const loadHistory = () => {
    setLoading(true)
    setHistoryPage(1)
    fetchPublishHistoryApi()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (tab === 'articles') loadArticles(1)
    else loadHistory()
  }, [tab])

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === articles.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(articles.map((a) => a.id)))
    }
  }

  const handleBatchPublish = async (platforms: string[]) => {
    await batchPublishApi(Array.from(selected), platforms)
    toast.success(`已发布到 ${platforms.length} 个平台`)
    loadArticles(page)
  }

  const handleSinglePublish = async (platforms: string[]) => {
    if (!publishTarget) return
    await publishArticleApi(publishTarget.ids[0], platforms)
    toast.success('发布成功')
    loadArticles(page)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteArticleApi(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      loadArticles(page)
    } catch {
      toast.error('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    try {
      await batchDeleteArticlesApi(Array.from(selected))
      toast.success(`已删除 ${selected.size} 篇文章`)
      setBatchDeleteOpen(false)
      setSelected(new Set())
      loadArticles(page)
    } catch {
      toast.error('批量删除失败')
    }
  }

  const getPublishBadge = (article: GeneratedArticle) => {
    const status = article.publishStatus
    if (!status || Object.keys(status).length === 0) {
      return <span className="text-[13px] text-muted-foreground/50">未发布</span>
    }
    const keys = Object.keys(status)
    return (
      <Badge className="text-[12px] font-medium rounded-[6px] bg-[var(--accent-soft)] text-[var(--accent-d)] border-0">
        {keys.length <= 1 ? '已发布' : `已发布 ${keys.length} 平台`}
      </Badge>
    )
  }

  /* ========== 分页计算 ========== */
  const historyTotalPages = Math.max(1, Math.ceil(history.length / historyPageSize))
  const paginatedHistory = history.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  )

  /* ========== 渲染 ========== */
  return (
    <div className="space-y-4">

      {/* ===== 页头 ===== */}
      <PageHeader
        title="内容管理"
        actions={
          <>
            {selected.size > 0 && (
              <>
                <Button variant="outline" className="h-8 gap-1.5 rounded-[8px] text-[13px] font-medium"
                  onClick={() => setPublishTarget({ ids: Array.from(selected), title: `${selected.size} 篇文章` })}>
                  <Send className="h-3.5 w-3.5" />批量发布 ({selected.size})
                </Button>
                <Button variant="outline"
                  className="h-8 gap-1.5 rounded-[8px] text-[13px] font-medium text-[var(--red)] border-[var(--red)]/30 hover:bg-[var(--red)]/5"
                  onClick={() => setBatchDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />批量删除 ({selected.size})
                </Button>
              </>
            )}
            <Button className="h-8 gap-1.5 rounded-[8px] text-[13px] font-medium" onClick={() => navigate('/content/create')}>
              <Plus className="h-3.5 w-3.5" />新建文章
            </Button>
          </>
        }
      />

      {/* ===== 标签切换 ===== */}
      <div className="flex gap-1 rounded-[10px] bg-[var(--fill-tertiary)] p-1 w-fit">
        <button onClick={() => setTab('articles')}
          className={`h-9 px-4 rounded-[7px] text-[13px] font-semibold transition-all ${tab === 'articles' ? 'bg-[var(--card)] text-[var(--ink)] shadow-[var(--shadow-xs)]' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'}`}>
          文章列表
        </button>
        <button onClick={() => setTab('history')}
          className={`h-9 px-4 rounded-[7px] text-[13px] font-semibold transition-all ${tab === 'history' ? 'bg-[var(--card)] text-[var(--ink)] shadow-[var(--shadow-xs)]' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'}`}>
          发布历史
        </button>
      </div>

      {/* ===== 内容区 ===== */}
      <ContentCard className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : tab === 'articles' ? (
          articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--fill-tertiary)]">
                <FileText className="h-6 w-6 text-[var(--ink-3)]/30" strokeWidth={1.7} />
              </div>
              <p className="mt-4 text-[14px] font-semibold text-[var(--ink-2)]">还没有文章</p>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">点击「新建文章」开始创建 AI 优化内容</p>
              <Button className="mt-4 h-8 gap-1.5 rounded-[10px] text-[13px] font-semibold" onClick={() => navigate('/content/create')}>
                <Plus className="h-3.5 w-3.5" />新建文章
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left">
                    <th className="py-4 pl-5 pr-1 w-10">
                      <button onClick={toggleAll} className="text-[var(--ink-3)]/40 hover:text-[var(--ink)] transition-colors" role="checkbox" aria-checked={selected.size === articles.length && articles.length > 0} aria-label="全选">
                        {selected.size === articles.length && articles.length > 0
                          ? <CheckSquare className="h-4 w-4" />
                          : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="py-4 pr-3 text-[11px] font-semibold text-[var(--ink-3)] w-[50px] text-right">ID</th>
                    <th className="py-4 pr-4 text-[11px] font-semibold text-[var(--ink-3)]">标题</th>
                    <th className="py-4 pr-4 text-[11px] font-semibold text-[var(--ink-3)] w-[100px]">话题</th>
                    <th className="py-4 pr-4 text-[11px] font-semibold text-[var(--ink-3)] w-[100px]">发布状态</th>
                    <th className="py-4 pr-4 text-[11px] font-semibold text-[var(--ink-3)] w-[120px] text-right">创建时间</th>
                    <th className="py-4 pr-5 text-[11px] font-semibold text-[var(--ink-3)] w-[110px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--fill-quaternary)] transition-colors">
                      <td className="py-5 pl-5 pr-1">
                        <button onClick={() => toggleSelect(row.id)} className="text-[var(--ink-3)]/40 hover:text-[var(--ink)] transition-colors" role="checkbox" aria-checked={selected.has(row.id)} aria-label={`选择: ${row.title}`}>
                          {selected.has(row.id)
                            ? <CheckSquare className="h-4 w-4 text-[var(--accent)]" />
                            : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="py-5 pr-3 text-[12px] text-[var(--ink-3)]/60 mono text-right">{row.id}</td>
                      <td className="py-5 pr-4">
                        <button className="text-[14px] font-semibold text-[var(--ink)] hover:text-[var(--accent-d)] transition-colors text-left truncate max-w-[400px] block"
                          onClick={() => navigate(`/content/articles/${row.id}`)}>{row.title}</button>
                      </td>
                      <td className="py-5 pr-4">
                        <Badge variant="secondary" className="inline-block max-w-[90px] truncate text-[11px] font-semibold rounded-full">{row.topic}</Badge>
                      </td>
                      <td className="py-5 pr-4">{getPublishBadge(row)}</td>
                      <td className="py-5 pr-4 text-[12px] text-[var(--ink-2)] text-right num whitespace-nowrap">{row.createTime?.substring(0, 10)}</td>
                      <td className="py-5 pr-5">
                        <div className="flex items-center gap-0.5">
                          <button className="h-8 w-8 flex items-center justify-center rounded-[6px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] transition-colors"
                            title="查看" onClick={() => navigate(`/content/articles/${row.id}`)}><Eye className="h-3.5 w-3.5" /></button>
                          <button className="h-8 w-8 flex items-center justify-center rounded-[6px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] transition-colors"
                            title="编辑" onClick={() => navigate(`/content/articles/${row.id}/edit`)}><Pencil className="h-3.5 w-3.5" /></button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-8 w-8 flex items-center justify-center rounded-[6px] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--fill-tertiary)] transition-colors">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36 rounded-[12px]">
                              <DropdownMenuItem className="text-[13px] cursor-pointer rounded-[8px]" onClick={() => setPublishTarget({ ids: [row.id], title: row.title })}>
                                <Send className="h-3.5 w-3.5 mr-2" />发布
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-[13px] cursor-pointer rounded-[8px] text-[var(--red)] focus:text-[var(--red)]" onClick={() => setDeleteTarget({ id: row.id, title: row.title })}>
                                <Trash2 className="h-3.5 w-3.5 mr-2" />删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--fill-tertiary)]">
              <Clock className="h-6 w-6 text-[var(--ink-3)]/30" strokeWidth={1.7} />
            </div>
            <p className="mt-4 text-[14px] font-semibold text-[var(--ink-2)]">暂无发布记录</p>
            <p className="mt-1 text-[12px] text-[var(--ink-3)]">发布文章后记录会出现在这里</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-4 pl-5 pr-4 text-[11px] font-semibold text-muted-foreground">文章标题</th>
                  <th className="py-4 pr-4 text-[11px] font-semibold text-muted-foreground w-[100px]">平台</th>
                  <th className="py-4 pr-4 text-[11px] font-semibold text-muted-foreground w-[90px]">状态</th>
                  <th className="py-4 pr-5 text-[11px] font-semibold text-muted-foreground w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map((h, i) => (
                  <tr key={`${h.articleId}-${h.platform}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-5 pl-5 pr-4 text-[14px] font-medium text-foreground truncate max-w-xs">{h.articleTitle}</td>
                    <td className="py-5 pr-4"><Badge className="text-[11px] font-medium rounded-[6px]">{h.platformLabel}</Badge></td>
                    <td className="py-5 pr-4"><Badge className="text-[11px] font-medium rounded-[6px] bg-[var(--accent-soft)] text-[var(--accent-d)] border-0">已发布</Badge></td>
                    <td className="py-5 pr-5">
                      <Button variant="ghost" size="sm" className="h-7 rounded-[6px] text-[12px] text-muted-foreground hover:text-foreground"
                        onClick={() => navigate(`/content/articles/${h.articleId}`)}>
                        <ExternalLink className="h-3 w-3 mr-0.5" />查看文章
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ContentCard>

      {/* ===== 分页 ===== */}
      {tab === 'articles' && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground">共 {total} 篇，第 {page}/{totalPages} 页</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-[8px] text-[12px]"
              disabled={page <= 1} onClick={() => loadArticles(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />上一页
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm"
                className="h-7 w-7 rounded-[8px] text-[12px]"
                onClick={() => loadArticles(p)}>{p}</Button>
            ))}
            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-[8px] text-[12px]"
              disabled={page >= totalPages} onClick={() => loadArticles(page + 1)}>
              下一页<ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {tab === 'history' && historyTotalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground">第 {historyPage} 页，共 {historyTotalPages} 页</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-[8px] text-[12px]"
              disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />上一页
            </Button>
            {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map((p) => (
              <Button key={p} variant={p === historyPage ? 'default' : 'outline'} size="sm"
                className="h-7 w-7 rounded-[8px] text-[12px]"
                onClick={() => setHistoryPage(p)}>{p}</Button>
            ))}
            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-[8px] text-[12px]"
              disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage(historyPage + 1)}>
              下一页<ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== 发布弹窗 ===== */}
      {publishTarget && (
        <PublishDialog
          open={publishTarget !== null}
          onOpenChange={(open) => { if (!open) setPublishTarget(null) }}
          title={publishTarget.ids.length > 1 ? `${publishTarget.ids.length} 篇文章` : publishTarget.title}
          onConfirm={publishTarget.ids.length > 1 ? handleBatchPublish : handleSinglePublish}
        />
      )}

      {/* ===== 删除确认弹窗 ===== */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="rounded-2xl gap-0">
          <DialogHeader className="space-y-2.5">
            <DialogTitle className="flex items-center gap-2.5 text-[15px] font-medium">
              <Trash2 className="h-4 w-4 text-destructive" />
              删除文章
            </DialogTitle>
            {deleteTarget && (
              <p className="text-[13px] text-muted-foreground truncate max-w-[240px]">{deleteTarget.title}</p>
            )}
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-[13px]" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button size="sm" className="h-8 rounded-lg text-[13px] bg-destructive hover:bg-destructive/90" onClick={handleDelete}>删除</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认 */}
      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent className="rounded-2xl gap-0 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--red)]/10">
              <Trash2 className="h-5 w-5 text-[var(--red)]" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[16px] font-semibold text-[var(--ink)] mb-1">批量删除文章</DialogTitle>
              <p className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                确认删除选中的 <span className="font-semibold text-[var(--ink)]">{selected.size}</span> 篇文章？此操作无法撤销。
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="ghost" className="h-9 px-5 rounded-[10px] text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]" onClick={() => setBatchDeleteOpen(false)}>取消</Button>
            <Button className="h-9 px-5 rounded-[10px] text-[13px] font-medium bg-[var(--red)] hover:bg-[var(--red)]/85 text-white" onClick={handleBatchDelete}>删除 {selected.size} 篇</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
