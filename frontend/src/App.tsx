import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ProtectedRoute } from '@/router'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CitationAnalysisPage } from '@/pages/monitor/CitationAnalysisPage'
import { SceneQuestionsPage } from '@/pages/monitor/SceneQuestionsPage'
import { AiSnapshotPage } from '@/pages/monitor/AiSnapshotPage'
import { BrandSentimentPage } from '@/pages/monitor/BrandSentimentPage'
import { ContentManagementPage } from '@/pages/content/ContentManagementPage'
import { ContentGenerationPage } from '@/pages/content/ContentGenerationPage'
import { CreateArticlePage } from '@/pages/content/CreateArticlePage'
import { ArticleDetailPage } from '@/pages/content/ArticleDetailPage'
import { ArticleEditPage } from '@/pages/content/ArticleEditPage'
import { KnowledgeBasePage } from '@/pages/KnowledgeBasePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BrandProfilePage } from '@/pages/BrandProfilePage'
import { ProductProfilePage } from '@/pages/ProductProfilePage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { TopicsSettingsPage } from '@/pages/settings/TopicsSettingsPage'
import { DouyinLeadPage } from '@/pages/acquisition/DouyinLeadPage'
import { Toaster } from '@/components/ui/sonner'

function AppInit({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInit>
        <ErrorBoundary>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* 受保护路由 */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              {/* AI 监测 */}
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/monitor/brand-visibility" element={<DashboardPage />} />
              <Route path="/monitor/citation-analysis" element={<CitationAnalysisPage />} />
              <Route path="/monitor/scene-questions" element={<SceneQuestionsPage />} />
              <Route path="/monitor/ai-snapshot" element={<AiSnapshotPage />} />
              <Route path="/monitor/brand-sentiment" element={<BrandSentimentPage />} />
              {/* AI 内容 */}
              <Route path="/content/management" element={<ContentManagementPage />} />
              <Route path="/content/generation" element={<ContentGenerationPage />} />
              <Route path="/content/create" element={<CreateArticlePage />} />
              <Route path="/content/articles/:id" element={<ArticleDetailPage />} />
              <Route path="/content/articles/:id/edit" element={<ArticleEditPage />} />
              {/* AI 获客 */}
              <Route path="/acquisition/overview" element={<DouyinLeadPage />} />
              {/* 知识库 & 设置 */}
              <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/brand-profile" element={<BrandProfilePage />} />
              <Route path="/settings/product-profile" element={<ProductProfilePage />} />
              <Route path="/settings/product-profile/:id" element={<ProductDetailPage />} />
              <Route path="/settings/topics" element={<TopicsSettingsPage />} />
            </Route>
          </Route>

          {/* 默认重定向 */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </ErrorBoundary>
      </AppInit>
      <Toaster position="top-center" />
    </BrowserRouter>
  )
}
