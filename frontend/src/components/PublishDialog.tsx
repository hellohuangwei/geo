import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Send, Check } from 'lucide-react'

interface Platform { key: string; label: string; desc: string }

const PLATFORMS: Platform[] = [
  { key:'zhihu', label:'知乎', desc:'问答社区 · 高质量长文' }, { key:'baijiahao', label:'百家号', desc:'百度生态 · 搜索流量大' },
  { key:'gzh', label:'微信公众号', desc:'私域触达 · 粉丝经济' }, { key:'juejin', label:'掘金', desc:'开发者社区 · 技术向' },
  { key:'csdn', label:'CSDN', desc:'IT技术社区 · 专业读者' }, { key:'jianshu', label:'简书', desc:'创作社区 · 文艺风格' },
  { key:'36kr', label:'36氪', desc:'科技媒体 · 创投圈' }, { key:'souhu', label:'搜狐号', desc:'新闻媒体 · 品牌曝光' },
]

interface PublishDialogProps { open: boolean; onOpenChange: (open: boolean) => void; title: string; onConfirm: (platforms: string[]) => Promise<void> }

export function PublishDialog({ open, onOpenChange, title, onConfirm }: PublishDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const toggle = (key: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })

  const handleConfirm = async () => { if (selected.size === 0) return; setLoading(true); await onConfirm(Array.from(selected)); setLoading(false); setSelected(new Set()); onOpenChange(false) }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader><DialogTitle>发布到平台</DialogTitle><DialogDescription className="mt-1">{title}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto">
          {PLATFORMS.map((p) => {
            const isSelected = selected.has(p.key)
            return (
              <button key={p.key} type="button" onClick={() => toggle(p.key)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150 ${isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-foreground/15 hover:bg-muted'}`}>
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/25'}`}>
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                <div><p className="text-sm font-bold text-foreground">{p.label}</p><p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p></div>
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-9 rounded-xl text-sm" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button className="h-9 gap-2 rounded-xl text-sm" onClick={handleConfirm} disabled={selected.size === 0 || loading}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />发布中...</> : <><Send className="h-4 w-4" />发布到 {selected.size} 个平台</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
