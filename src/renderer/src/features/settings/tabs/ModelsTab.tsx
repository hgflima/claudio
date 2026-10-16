import { useEffect, useState } from 'react'
import { api, type ModelInfo, type Settings } from '@/lib/api'
import { Row, Section, Select, type Option } from '../controls'

type Effort = Settings['defaultEffort']
const EFFORTS: Option<Effort>[] = [
  { value: '', label: 'Default' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }, { value: 'xhigh', label: 'Extra high' }, { value: 'max', label: 'Max' }
]

export function ModelsTab({ s, update }: { s: Settings; update: (p: Partial<Settings>) => void }) {
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.invoke('sessions:listModels').then(setModels).catch((e: unknown) => { setModels([]); setError(String(e)) })
  }, [])

  const options: Option<string>[] = [{ value: '', label: 'Default' }, ...(models ?? []).map((m) => ({ value: m.value, label: m.displayName }))]
  if (s.defaultModel && !options.some((o) => o.value === s.defaultModel)) options.push({ value: s.defaultModel, label: s.defaultModel })
  const current = models?.find((m) => m.value === s.defaultModel)

  return (
    <Section title="Defaults for new sessions" description="Each session can still override these from the composer.">
      <Row label="Model" hint={models === null ? 'Loading models…' : error ? 'Could not load the model list' : current?.description}>
        <Select label="Default model" value={s.defaultModel} options={options} onChange={(defaultModel) => update({ defaultModel })} />
      </Row>
      <Row label="Effort" hint="How much Claude thinks before answering">
        <Select label="Default effort" value={s.defaultEffort} options={EFFORTS} onChange={(defaultEffort) => update({ defaultEffort })} />
      </Row>
    </Section>
  )
}
