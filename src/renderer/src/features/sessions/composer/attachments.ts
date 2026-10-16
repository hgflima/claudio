import { api } from '@/lib/api'
import type { Attachment } from '@shared/ipc'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Turn dropped/pasted files into attachments: images become inline image blocks, others @path mentions. */
export async function filesToAttachments(files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = []
  for (const file of files) {
    let path = ''
    try {
      path = api.pathForFile(file)
    } catch {
      path = ''
    }
    if (IMAGE_TYPES.has(file.type)) {
      if (path) {
        const a = await api.invoke('app:readFileAsAttachment', path).catch(() => null)
        if (a) {
          out.push(a)
          continue
        }
      }
      out.push({ type: 'image', mediaType: file.type, dataBase64: await readAsBase64(file), name: file.name || 'pasted image' })
    } else if (path) {
      out.push({ type: 'file', path })
    }
  }
  return out
}

export async function pathsToAttachments(paths: string[]): Promise<Attachment[]> {
  const res = await Promise.all(paths.map((p) => api.invoke('app:readFileAsAttachment', p).catch(() => null)))
  return res.map((a, i) => a ?? { type: 'file', path: paths[i] })
}

export function attachmentKey(a: Attachment, i: number): string {
  return a.type === 'file' ? a.path : `${a.name ?? 'img'}-${i}-${a.dataBase64.length}`
}
