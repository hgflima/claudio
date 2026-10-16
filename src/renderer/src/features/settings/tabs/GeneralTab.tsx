import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { api, type NotifyLevel, type Settings, type ThemeMode } from '@/lib/api'
import { Row, Section, Segmented, Select, Toggle, type Option } from '../controls'
import { ShortcutInput } from '../ShortcutInput'

const THEMES: Option<ThemeMode>[] = [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]
const LEVELS: Option<NotifyLevel>[] = [{ value: 'banner', label: 'Banner' }, { value: 'off', label: 'Off' }]
const KINDS: { key: keyof Settings['notifications']; label: string; hint: string }[] = [
  { key: 'permission', label: 'Permission requests', hint: 'When Claude needs your approval to continue' },
  { key: 'done', label: 'Finished responses', hint: 'When Claude finishes working on a task' },
  { key: 'error', label: 'Errors', hint: 'When a session stops with an error' }
]

type ShortcutStatus = Awaited<ReturnType<typeof api.invoke<'quick:shortcutStatus'>>>

const SHORTCUT_ERRORS: Record<NonNullable<ShortcutStatus['error']>, string> = {
  'invalid-accelerator': 'This key combination is not a valid shortcut.',
  'registration-failed': 'Another app is already using this shortcut.'
}

function useShortcutStatus(accelerator: string): ShortcutStatus | null {
  const [status, setStatus] = useState<ShortcutStatus | null>(null)
  useEffect(() => {
    let alive = true
    api.invoke('quick:shortcutStatus').then((s) => { if (alive) setStatus(s) }, () => { if (alive) setStatus(null) })
    return () => { alive = false }
  }, [accelerator])
  return status
}

function useEditors(): Option<string>[] | null {
  const [editors, setEditors] = useState<Option<string>[] | null>(null)
  useEffect(() => {
    let alive = true
    api.invoke('app:listEditors').then(
      (list) => { if (alive) setEditors(list.map((e) => ({ value: e.id, label: e.name }))) },
      () => { if (alive) setEditors([]) }
    )
    return () => { alive = false }
  }, [])
  return editors
}

function shortcutHint(accelerator: string, status: ShortcutStatus | null) {
  if (!accelerator || !status || status.registered) return 'Global shortcut that opens the Quick Entry window'
  return (
    <span className="flex items-center gap-1.5 text-warning">
      <TriangleAlert size={13} className="shrink-0" />
      {status.error ? SHORTCUT_ERRORS[status.error] : 'Shortcut is not active.'}
    </span>
  )
}

export function GeneralTab({ s, update }: { s: Settings; update: (p: Partial<Settings>) => void }) {
  const mac = api.platform === 'darwin'
  const shortcut = useShortcutStatus(s.quickEntryShortcut)
  const editors = useEditors()
  const editorOptions: Option<string>[] = [{ value: '', label: editors?.length ? `Auto (${editors[0].label})` : 'Auto' }, ...(editors ?? [])]
  if (s.preferredEditor && !editorOptions.some((o) => o.value === s.preferredEditor)) editorOptions.push({ value: s.preferredEditor, label: `${s.preferredEditor} (not found)` })
  return (
    <>
      <Section title="Appearance">
        <Row label="Theme">
          <Segmented value={s.theme} options={THEMES} onChange={(theme) => update({ theme })} />
        </Row>
      </Section>

      <Section title="Desktop app">
        <Row label="Quick Entry shortcut" hint={shortcutHint(s.quickEntryShortcut, shortcut)}>
          <ShortcutInput mac={mac} value={s.quickEntryShortcut} onChange={(quickEntryShortcut) => update({ quickEntryShortcut })} />
        </Row>
        <Row label={mac ? 'Show in menu bar' : 'Show in system tray'}>
          <Toggle label="Show in menu bar" checked={s.menuBarEnabled} onChange={(menuBarEnabled) => update({ menuBarEnabled })} />
        </Row>
        <Row label="Open at login">
          <Toggle label="Open at login" checked={s.openAtLogin} onChange={(openAtLogin) => update({ openAtLogin })} />
        </Row>
        <Row label={mac ? 'Keep Mac awake while Claude works' : 'Keep computer awake while Claude works'} hint="Prevents idle sleep while a session is running">
          <Toggle label="Keep awake while Claude works" checked={s.keepAwake} onChange={(keepAwake) => update({ keepAwake })} />
        </Row>
      </Section>

      <Section title="Editor">
        <Row label="Preferred editor" hint={editors === null ? 'Looking for installed editors…' : editors.length ? 'Used by “Open in Editor” (⌘⇧E)' : 'No supported editor found — files open with the default app'}>
          <Select label="Preferred editor" value={s.preferredEditor} options={editorOptions} onChange={(preferredEditor) => update({ preferredEditor })} />
        </Row>
      </Section>

      <Section title="Notifications" description="Shown only while Claudio is in the background.">
        {KINDS.map((k) => (
          <Row key={k.key} label={k.label} hint={k.hint}>
            <Select
              label={k.label} value={s.notifications[k.key]} options={LEVELS}
              onChange={(v) => update({ notifications: { ...s.notifications, [k.key]: v } })}
            />
          </Row>
        ))}
        <Row label="Play sound">
          <Toggle label="Play sound" checked={s.notificationSound} onChange={(notificationSound) => update({ notificationSound })} />
        </Row>
      </Section>
    </>
  )
}
