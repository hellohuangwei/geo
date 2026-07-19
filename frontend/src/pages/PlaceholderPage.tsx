import { Box } from 'lucide-react'

interface PlaceholderPageProps { title: string; description?: string; children?: React.ReactNode }

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <div className="">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-[var(--ink)] tracking-[-0.02em]">{title}</h1>
        {description && <p className="text-[11.5px] text-[var(--ink-3)] mt-0.5">{description}</p>}
      </div>
      {children ? children : (
        <div className="bg-[var(--card)] rounded-[20px] border border-[var(--line)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-[16px] bg-[var(--fill-tertiary)] flex items-center justify-center mb-5">
              <Box className="h-6 w-6 text-[var(--ink-3)]" strokeWidth={1.7} />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--ink-2)]">页面开发中</h3>
            <p className="text-[12px] text-[var(--ink-3)] mt-1">此页面将在后续版本中实现</p>
          </div>
        </div>
      )}
    </div>
  )
}
