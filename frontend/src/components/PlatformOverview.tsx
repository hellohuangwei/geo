import { Yuanbao, DeepSeek, Baidu, Qwen } from '@lobehub/icons'

/* ========== Platform Logos ========== */
function DoubaoLogo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <circle cx="12" cy="12" r="11" fill="var(--system-green)" />
      <ellipse cx="12" cy="7" rx="10" ry="7" fill="#1a3a1a" />
      <path d="M4 9 Q6 4 12 3 Q18 4 20 9" fill="#1a3a1a" />
      <rect x="3" y="6" width="18" height="6" rx="2" fill="#1a3a1a" />
      <ellipse cx="12" cy="12" rx="7" ry="6.5" fill="#fddcb5" />
      <circle cx="9.5" cy="11" r="1.3" fill="#1a1a1a" />
      <circle cx="14.5" cy="11" r="1.3" fill="#1a1a1a" />
      <circle cx="9.8" cy="10.6" r="0.45" fill="white" />
      <circle cx="14.8" cy="10.6" r="0.45" fill="white" />
      <ellipse cx="7.5" cy="13.5" rx="1.8" ry="1" fill="#ffb3b3" opacity="0.5" />
      <ellipse cx="16.5" cy="13.5" rx="1.8" ry="1" fill="#ffb3b3" opacity="0.5" />
      <path d="M10 14.5 Q12 16.5 14 14.5" stroke="#1a1a1a" strokeWidth="0.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function KimiLogo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <rect width="24" height="24" rx="6" fill="#111111" />
      <rect x="3" y="5" width="5" height="10" rx="1" fill="white" />
      <rect x="9" y="5" width="5" height="10" rx="1" fill="white" />
      <rect x="15" y="5" width="5" height="10" rx="1" fill="white" />
      <rect x="6.5" y="5" width="3" height="6" rx="0.8" fill="#111111" />
      <rect x="12.5" y="5" width="3" height="6" rx="0.8" fill="#111111" />
      <circle cx="12" cy="20" r="3" fill="white" />
      <circle cx="13" cy="19.5" r="2.5" fill="#111111" />
    </svg>
  )
}

const platforms = [
  { name: '豆包', render: () => <DoubaoLogo size={28} /> },
  { name: '元宝', render: () => <Yuanbao.Color size={28} /> },
  { name: 'DeepSeek', render: () => <DeepSeek.Color size={28} /> },
  { name: '百度 AI', render: () => <Baidu.Color size={28} /> },
  { name: '通义千问', render: () => <Qwen.Color size={28} /> },
  { name: 'Kimi', render: () => <KimiLogo size={28} /> },
]

/* ========== Component ========== */
export function PlatformOverview() {
  return (
    <>
      {/* AI Citation Rate */}
      <div className="flex items-center gap-5 shrink-0">
        <div className="relative shrink-0">
          <svg width="88" height="88" className="-rotate-90" role="img" aria-label="AI 引用率：58.3%">
            <circle cx="44" cy="44" r="38" fill="none" stroke="var(--fill-tertiary)" strokeWidth="5" />
            <circle cx="44" cy="44" r="38" fill="none" stroke="var(--accent)" strokeWidth="5"
              strokeDasharray={2 * Math.PI * 38}
              strokeDashoffset={2 * Math.PI * 38 * (1 - 0.583)}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] font-bold text-[var(--accent)] uppercase tracking-[0.05em]">AI</span>
            <span className="text-[18px] font-bold text-[var(--label-primary)] leading-none mt-0.5"
              style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
              58
            </span>
            <span className="text-[11px] font-medium text-[var(--label-secondary)]">.3%</span>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[var(--label-secondary)] uppercase tracking-[0.06em]">AI 引用率</p>
          <p className="text-[40px] font-bold text-[var(--label-primary)] leading-none mt-1 tracking-[-0.03em]"
            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
            58.3<small className="text-[24px] font-semibold">%</small>
          </p>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--system-green)] bg-[var(--system-green)]/10 rounded-full px-2 py-0.5 mt-2">
            ↑ 12.1%
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="hidden lg:block w-px self-stretch bg-[var(--separator)]" />

      {/* Platform logos */}
      <div className="flex items-center gap-5">
        {platforms.map(p => (
          <div key={p.name} className="flex flex-col items-center gap-1.5 cursor-default hover:opacity-80 transition-opacity" title={p.name}>
            <div className="w-10 h-10 rounded-xl bg-[var(--fill-quaternary)] flex items-center justify-center">
              {p.render()}
            </div>
            <span className="text-[10px] font-medium text-[var(--label-secondary)]">{p.name}</span>
          </div>
        ))}
      </div>
    </>
  )
}
