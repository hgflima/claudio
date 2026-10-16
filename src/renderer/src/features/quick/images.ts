import type { Attachment } from '@/lib/api'

export type ImageAttachment = Extract<Attachment, { type: 'image' }>

const MAX_BYTES = 10 * 1024 * 1024

export function fileToImageAttachment(file: File): Promise<ImageAttachment | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_BYTES) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const comma = url.indexOf(',')
      resolve(comma > 0 ? { type: 'image', mediaType: file.type, dataBase64: url.slice(comma + 1), name: file.name || undefined } : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export async function imagesFrom(files: Iterable<File>): Promise<ImageAttachment[]> {
  const out = await Promise.all([...files].map(fileToImageAttachment))
  return out.filter((a): a is ImageAttachment => a !== null)
}
