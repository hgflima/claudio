// Orchestrator-owned global UI state. Feature stores live in features/<name>/store.ts.
import { create } from 'zustand'

export type RightPanel = 'terminal' | 'changes' | null
export type SettingsTab = 'general' | 'models' | 'permissions' | 'mcp' | 'skills' | 'about'

interface UiState {
  activeSessionId: string | null
  sidebarOpen: boolean
  rightPanel: RightPanel
  settingsOpen: boolean
  settingsTab: SettingsTab
  setActiveSession: (id: string | null) => void
  toggleSidebar: () => void
  setRightPanel: (p: RightPanel) => void
  toggleRightPanel: (p: Exclude<RightPanel, null>) => void
  openSettings: (tab?: SettingsTab) => void
  closeSettings: () => void
}

export const useUi = create<UiState>((set, get) => ({
  activeSessionId: null,
  sidebarOpen: true,
  rightPanel: null,
  settingsOpen: false,
  settingsTab: 'general',
  setActiveSession: (id) => set({ activeSessionId: id }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setRightPanel: (p) => set({ rightPanel: p }),
  toggleRightPanel: (p) => set({ rightPanel: get().rightPanel === p ? null : p }),
  openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? get().settingsTab }),
  closeSettings: () => set({ settingsOpen: false })
}))
