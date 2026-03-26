import { create } from 'zustand'
import type { ViewType, AgentType } from '@/types'

interface AppState {
  currentView: ViewType
  selectedAgent: AgentType | null
  selectedSkillId: string | null
  editingSkillId: string | null
  searchQuery: string
  setCurrentView: (view: ViewType) => void
  setSelectedAgent: (agent: AgentType | null) => void
  setSelectedSkillId: (id: string | null) => void
  setEditingSkillId: (id: string | null) => void
  setSearchQuery: (query: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  selectedAgent: null,
  selectedSkillId: null,
  editingSkillId: null,
  searchQuery: '',
  setCurrentView: (view) => set({ currentView: view, selectedSkillId: null }),
  setSelectedAgent: (agent) => set({ selectedAgent: agent, selectedSkillId: null }),
  setSelectedSkillId: (id) => set({ selectedSkillId: id }),
  setEditingSkillId: (id) => set({ editingSkillId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}))
