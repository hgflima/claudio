// Owner: agent "mcp-quick". Global host for install dialogs triggered by files opened from Finder.
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ExtensionPreview } from '@/lib/api'
import { InstallExtensionDialog } from './InstallExtensionDialog'
import { InstallSkillDialog } from './InstallSkillDialog'
import { Modal } from './Modal'
import { Button, errorMessage } from './ui'

function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Modal title="Couldn't open extension" onClose={onClose}>
      <p className="text-sm text-danger">{message}</p>
      <div className="mt-4 flex justify-end"><Button onClick={onClose}>OK</Button></div>
    </Modal>
  )
}

export function ExtensionsHost() {
  const [preview, setPreview] = useState<ExtensionPreview | null>(null)
  const [skillFile, setSkillFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const offExt = api.on('ext:openRequested', ({ filePath }) => {
      api.invoke('ext:preview', filePath).then(setPreview, (e: unknown) => setError(errorMessage(e)))
    })
    const offSkill = api.on('skills:openRequested', ({ filePath }) => setSkillFile(filePath))
    return () => { offExt(); offSkill() }
  }, [])

  if (error) return <ErrorDialog message={error} onClose={() => setError(null)} />
  if (preview) return <InstallExtensionDialog preview={preview} onClose={() => setPreview(null)} />
  if (skillFile) return <InstallSkillDialog key={skillFile} filePath={skillFile} onClose={() => setSkillFile(null)} />
  return null
}
