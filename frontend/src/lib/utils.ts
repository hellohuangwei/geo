import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 将 Markdown 内容转换为 HTML */
export function renderMd(content: string): string {
  if (!content) return ''

  let html = content
    // 行内代码（必须在其他行内规则之前）
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // 标题（兼容有无空格：## 标题 和 ##标题 都有效）
    .replace(/^####\s*(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s*(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s*(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s*(.+)$/gm, '<h1>$1</h1>')
    // 分隔线
    .replace(/^---$/gm, '<hr/>')
    // 有序列表（兼容有无空格：1. item 和 1.item 都有效）
    .replace(/^(\d+)\.\s*(.+)$/gm, '<ol-li>$2</ol-li>')
    // 无序列表（兼容有无空格：- item 和 -item 都有效）
    .replace(/^-\s*(.+)$/gm, '<ul-li>$1</ul-li>')

  // 把连续的同类列表项包在正确的容器里
  html = html.replace(/((?:<ul-li>.*<\/ul-li>\n?)+)/g, '<ul>$1</ul>')
  html = html.replace(/((?:<ol-li>.*<\/ol-li>\n?)+)/g, '<ol>$1</ol>')

  // 还原自定义标签为标准 <li>
  html = html.replace(/<ul-li>/g, '<li>').replace(/<\/ul-li>/g, '</li>')
  html = html.replace(/<ol-li>/g, '<li>').replace(/<\/ol-li>/g, '</li>')

  // 按空行分裂为块，非块级元素包 <p>
  return html
    .split('\n\n')
    .map((block) => {
      const t = block.trim()
      if (!t) return ''
      if (/^<(h[1-4]|ul|ol|hr|pre|blockquote)/.test(t)) return t
      return `<p>${t.replace(/\n/g, '<br/>')}</p>`
    })
    .join('\n')
}
