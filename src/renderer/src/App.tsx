// Orchestrator-owned layout. Each slot is implemented by its owning agent inside features/<name>/.
import { TitleBar } from './features/shell/TitleBar'
import { AppEffects } from './features/shell/AppEffects'
import { Sidebar } from './features/sessions/Sidebar'
import { SessionView } from './features/sessions/SessionView'
import { RightPanel } from './features/panels/RightPanel'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { useUi } from './stores/ui'

export function App() {
  const { sidebarOpen, rightPanel } = useUi()
  return (
    <div className="flex h-full flex-col">
      <AppEffects />
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <Sidebar />}
        <main className="flex min-w-0 flex-1 flex-col"><SessionView /></main>
        {rightPanel && <RightPanel />}
      </div>
      <SettingsDialog />
    </div>
  )
}
