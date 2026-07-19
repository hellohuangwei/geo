import { useMemo } from 'react'
import { diffLines, type DiffLine } from '@/lib/diff'
import { renderMd } from '@/lib/utils'

interface DiffPreviewProps {
  original: string
  current: string
}

/** Render markdown-preview with inline diff highlights */
export function DiffPreview({ original, current }: DiffPreviewProps) {
  const groups = useMemo(() => {
    const lines = diffLines(original, current)
    // Group consecutive same-type lines
    const g: DiffLine[][] = []
    for (const line of lines) {
      const last = g[g.length - 1]
      if (last && last[0].type === line.type && last[0].type !== 'modified') {
        last.push(line)
      } else {
        g.push([line])
      }
    }
    return g
  }, [original, current])

  // All content is unchanged — just render normally
  if (groups.length === 0 || (groups.length === 1 && groups[0][0].type === 'unchanged')) {
    return (
      <div className="prose prose-slate max-w-none prose-headings:text-foreground prose-headings:font-bold prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground/85 prose-li:text-sm prose-strong:text-foreground [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-bold [&_ul]:my-3 [&_p]:my-3"
        dangerouslySetInnerHTML={{ __html: renderMd(current) }} />
    )
  }

  return (
    <div className="space-y-1">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block w-1 h-4 rounded-full bg-[var(--accent-d)]" /> 新增
        <span className="inline-block w-1 h-4 rounded-full bg-[var(--orange)] ml-2" /> 修改（悬停查看原文）
      </div>
      <div className="prose prose-slate max-w-none prose-headings:text-foreground prose-headings:font-bold prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground/85 prose-li:text-sm prose-strong:text-foreground [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-bold [&_ul]:my-3 [&_p]:my-3"
        dangerouslySetInnerHTML={{ __html: buildDiffHtml(groups) }}
      />
    </div>
  )
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildDiffHtml(groups: DiffLine[][]): string {
  return groups
    .map((group) => {
      const type = group[0].type

      if (type === 'unchanged') {
        const md = group.map((l) => l.newLine!).join('\n')
        return renderMd(md)
      }

      if (type === 'added') {
        const md = group.map((l) => l.newLine!).join('\n')
        return `<div class="diff-added">${renderMd(md)}</div>`
      }

      if (type === 'modified') {
        return group
          .map((l) => {
            const newHtml = renderMd(l.newLine || '')
            return `<div class="diff-modified" data-original="${esc(l.oldLine || '')}">${newHtml}</div>`
          })
          .join('')
      }

      // removed — not shown in preview
      return ''
    })
    .join('\n')
}
