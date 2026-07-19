import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Building2, MessageCircle, Cpu, Globe } from 'lucide-react'

const platforms = ['ChatGPT','DeepSeek','豆包','通义千问','Kimi','百度AI','元宝']
const topics = ['SaaS','CRM','ERP','AI工具','项目管理','远程办公']
const competitors = ['飞书','钉钉','企业微信','Notion','Airtable']

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="px-5 py-3.5 flex items-center gap-2 border-b border-border">
      <Icon className="section-icon" />
      <h2 className="section-title !mb-0">{title}</h2>
    </div>
  )
}

export function SettingsPage() {
  return (
    <div className="space-y-5">
      <div><h1 className="page-title">设置</h1><p className="page-desc">管理品牌信息、平台配置和API设置</p></div>

      {/* 品牌信息 */}
      <div className="soft-card overflow-hidden">
        <SectionHeader icon={Building2} title="品牌信息" />
        <div className="p-5 grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div><label className="text-sm font-bold text-foreground">品牌名称</label><Input className="mt-1.5 h-10 rounded-xl" placeholder="输入品牌名称" defaultValue="Geo" /></div>
          <div><label className="text-sm font-bold text-foreground">品牌Logo</label><Input className="mt-1.5 h-10 rounded-xl" placeholder="上传Logo URL" /></div>
          <div><label className="text-sm font-bold text-foreground">官方网站</label><Input className="mt-1.5 h-10 rounded-xl max-w-md" placeholder="https://example.com" /></div>
          <div><label className="text-sm font-bold text-foreground">联系方式</label><Input className="mt-1.5 h-10 rounded-xl max-w-md" placeholder="contact@example.com" /></div>
        </div>
      </div>

      {/* 监测话题 + 竞品品牌 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="soft-card overflow-hidden flex flex-col">
          <SectionHeader icon={MessageCircle} title="监测话题" />
          <div className="p-5 flex-1">
            <Input className="h-10 rounded-xl max-w-sm" placeholder="添加话题关键词" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topics.map((t) => (<span key={t} className="soft-badge">{t}</span>))}
            </div>
          </div>
        </div>
        <div className="soft-card overflow-hidden flex flex-col">
          <SectionHeader icon={Globe} title="竞品品牌" />
          <div className="p-5 flex-1">
            <Input className="h-10 rounded-xl max-w-sm" placeholder="添加竞品品牌" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {competitors.map((c) => (<span key={c} className="soft-badge">{c}</span>))}
            </div>
          </div>
        </div>
      </div>

      {/* AI 平台配置 — 响应式 Grid 卡片 */}
      <div className="soft-card overflow-hidden">
        <SectionHeader icon={Cpu} title="AI 平台配置" />
        <div className="p-5">
          <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {platforms.map((p) => (
              <div key={p} className="flex items-center justify-between rounded-xl bg-muted/50 px-4 h-14">
                <span className="text-sm font-bold text-foreground truncate">{p}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-d)] shrink-0 ml-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />已连接
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end"><Button className="h-10 rounded-xl text-sm font-bold">保存设置</Button></div>
    </div>
  )
}
