import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAppStore } from '@/stores/appStore'
import { useUpdateStore } from '@/stores/updateStore'
import Sidebar from '@/components/layout/Sidebar'
import Dashboard from '@/views/Dashboard'
import RegistryBrowser from '@/views/RegistryBrowser'
import SettingsModal from '@/views/SettingsModal'
import SkillEditorView from '@/views/SkillEditorView'
import Notifications from '@/components/ui/Notifications'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
})

function UpdateInitializer() {
  const init = useUpdateStore((s) => s.init)
  useEffect(() => {
    init()
  }, [init])
  return null
}

function MainContent() {
  const currentView = useAppStore((s) => s.currentView)
  const editingSkillId = useAppStore((s) => s.editingSkillId)
  const setEditingSkillId = useAppStore((s) => s.setEditingSkillId)

  return (
    <>
      <div className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'registry' && <RegistryBrowser />}
        {currentView === 'settings' && <SettingsModal />}
      </div>

      {/* Full-screen editor overlay — only triggered by Edit button */}
      {editingSkillId && (
        <div className="fixed inset-0 z-40 bg-bg">
          <SkillEditorView
            skillId={editingSkillId}
            onClose={() => setEditingSkillId(null)}
          />
        </div>
      )}
    </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-screen overflow-hidden bg-bg text-text-primary">
        <Sidebar />
        <MainContent />
      </div>
      <Notifications />
      <UpdateInitializer />
    </QueryClientProvider>
  )
}

export default App
