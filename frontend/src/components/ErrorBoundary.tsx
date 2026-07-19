import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-5 max-w-md px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--fill-tertiary)] mx-auto">
              <AlertTriangle className="h-8 w-8 text-[var(--orange)]" strokeWidth={1.7} />
            </div>
            <div className="space-y-2">
              <p className="text-[17px] font-semibold text-[var(--ink)]">页面加载异常</p>
              <p className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                页面渲染时发生错误，请尝试刷新页面。如果问题持续，请联系管理员。
              </p>
              {this.state.error && (
                <p className="text-[11px] text-[var(--ink-3)]/60 font-mono mt-2 break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-[14px] font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-d)] active:scale-[0.97] transition-all shadow-none"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
