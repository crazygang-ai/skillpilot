import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAppStore } from '@/stores/appStore'
import { useAppUpdateSync } from '@/hooks/useAppUpdateSync'
import { useSkillWatcherSync } from '@/hooks/useSkillWatcherSync'
import Sidebar from '@/components/layout/Sidebar'
import Dashboard from '@/views/Dashboard'
import RegistryBrowser from '@/views/RegistryBrowser'
import SettingsModal from '@/views/SettingsModal'
import SkillEditorView from '@/views/SkillEditorView'
import Notifications from '@/components/ui/Notifications'
import ViewErrorBoundary from '@/components/ui/ViewErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
})

function AppUpdateInitializer() {
  useAppUpdateSync()
  return null
}

function SkillWatcherInitializer() {
  useSkillWatcherSync()
  return null
}

function MainContent() {
  const currentView = useAppStore((s) => s.currentView)
  const editingSkillId = useAppStore((s) => s.editingSkillId)
  const setEditingSkillId = useAppStore((s) => s.setEditingSkillId)

  return (
    <>
      <div className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && (
          <ViewErrorBoundary viewName="Dashboard">
            <Dashboard />
          </ViewErrorBoundary>
        )}
        {currentView === 'registry' && (
          <ViewErrorBoundary viewName="Registry">
            <RegistryBrowser />
          </ViewErrorBoundary>
        )}
        {currentView === 'settings' && (
          <ViewErrorBoundary viewName="Settings">
            <SettingsModal />
          </ViewErrorBoundary>
        )}
      </div>

      {editingSkillId && (
        <div className="fixed inset-0 z-40 bg-bg">
          <ViewErrorBoundary viewName="Skill Editor">
            <SkillEditorView
              skillId={editingSkillId}
              onClose={() => setEditingSkillId(null)}
            />
          </ViewErrorBoundary>
        </div>
      )}
    </>
  )
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-bg text-text-primary">
          <div className="text-center max-w-md p-8">
            <h1 className="text-xl font-semibold mb-3">Something went wrong</h1>
            <p className="text-sm text-text-muted mb-6 break-words">{this.state.error?.message}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div className="flex h-screen w-screen overflow-hidden bg-bg text-text-primary">
          <Sidebar />
          <MainContent />
        </div>
        <Notifications />
        <AppUpdateInitializer />
        <SkillWatcherInitializer />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App
