// no React hooks needed here currently
import { Upload, FileText, Database, File, FileSpreadsheet, Globe, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const sources = [
  { name: '产品白皮书 2025.pdf', type: 'PDF', size: '2.4 MB', date: '2026-07-01', status: '已索引' },
  { name: '品牌介绍与FAQ.docx', type: 'Word', size: '1.1 MB', date: '2026-06-28', status: '已索引' },
  { name: '技术参数表.xlsx', type: 'Excel', size: '856 KB', date: '2026-06-25', status: '已索引' },
  { name: '官网产品页面', type: 'Website', size: '—', date: '2026-07-05', status: '同步中' },
  { name: '行业分析报告.md', type: 'Markdown', size: '420 KB', date: '2026-07-03', status: '已索引' },
]

const typeIcons: Record<string, React.ElementType> = {
  'PDF': FileText,
  'Word': FileText,
  'Excel': FileSpreadsheet,
  'Website': Globe,
  'Markdown': File,
}

const typeColors: Record<string, string> = {
  'PDF': 'var(--red)',
  'Word': 'var(--blue)',
  'Excel': 'var(--accent-d)',
  'Website': 'var(--purple)',
  'Markdown': 'var(--orange)',
}

export function KnowledgeBasePage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Left */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--ink)] tracking-[-0.02em]">知识库</h1>
          <p className="text-[11.5px] text-[var(--ink-3)] mt-0.5">为AI内容生成提供RAG知识支持</p>
        </div>

        {/* Upload zone */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="flex flex-col items-center justify-center py-12 m-3 rounded-[16px] border-2 border-dashed border-[var(--line)] hover:border-[var(--accent)]/30 transition-colors cursor-pointer group" role="button" tabIndex={0} aria-label="上传文件到知识库" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault() }}>
            <div className="w-14 h-14 rounded-[16px] bg-[var(--fill-tertiary)] grid place-items-center group-hover:bg-[var(--accent-soft)] transition-colors">
              <Upload className="h-6 w-6 text-[var(--ink-3)] group-hover:text-[var(--accent-d)] transition-colors" strokeWidth={1.7} />
            </div>
            <p className="mt-4 text-[14px] font-semibold text-[var(--ink)]">拖拽或点击上传文件</p>
            <p className="mt-1 text-[11.5px] text-[var(--ink-3)]">支持 PDF · Word · Markdown · Excel · 网页链接</p>
          </div>
        </div>

        {/* Source list */}
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-[22px] py-4 flex items-center gap-2 border-b border-[var(--line)]">
            <Database className="h-4 w-4 text-[var(--accent-d)]" />
            <h2 className="text-[15px] font-semibold">已有知识来源</h2>
            <span className="ml-auto text-[11px] text-[var(--ink-3)]">{sources.length} 个来源</span>
          </div>
          {sources.map((s, i) => {
            const Icon = typeIcons[s.type] || File
            const color = typeColors[s.type] || 'var(--ink-3)'
            return (
              <div key={i} className="flex items-center gap-3.5 px-[22px] py-3.5 border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--fill-quaternary)] transition-colors">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                  style={{ background: `${color}15` }}>
                  <Icon className="h-4 w-4" style={{ color }} strokeWidth={1.7} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--ink)] truncate">{s.name}</div>
                  <div className="text-[11px] text-[var(--ink-3)]">{s.type} · {s.size} · {s.date}</div>
                </div>
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-[6px]',
                  s.status === '已索引' ? 'bg-[var(--accent-soft)] text-[var(--accent-d)]' : 'bg-[var(--fill-tertiary)] text-[var(--ink-2)]')}>{s.status}</span>
                <button className="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--red)] hover:bg-[var(--fill-tertiary)] transition-colors border-0 bg-transparent cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right — Stats */}
      <div className="flex flex-col gap-4">
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <h3 className="text-[15px] font-semibold">知识库统计</h3>
          <div className="text-[11.5px] text-[var(--ink-3)] mb-4">存储概况</div>
          {[
            { label: '文件总数', value: '5', icon: File, color: 'var(--accent)' },
            { label: '总大小', value: '4.8 MB', icon: Database, color: 'var(--blue)' },
            { label: '已索引', value: '4', icon: FileText, color: 'var(--accent-d)' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-3 py-3 border-b border-[var(--line-2)] last:border-0">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: `${s.color}15` }}>
                <s.icon className="h-4 w-4" style={{ color: s.color }} strokeWidth={1.7} />
              </div>
              <div className="flex-1 text-[13px] font-medium">{s.label}</div>
              <b className="text-[16px] font-extrabold num">{s.value}</b>
            </div>
          ))}
        </div>

        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] p-[22px] shadow-[var(--shadow-card)]">
          <h3 className="text-[15px] font-semibold">使用建议</h3>
          <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed mt-2">
            上传品牌白皮书、产品规格文档和FAQ手册，AI 将在生成内容时自动引用相关知识，提升内容的专业度和准确性。
          </p>
        </div>
      </div>
    </div>
  )
}
