import type { Attachment } from '@shared/ipc'

export interface ComposerDraft { text: string; attachments: Attachment[] }

/** Unsent composer content per session ('home' for the new-session screen). */
export const drafts = new Map<string, ComposerDraft>()

export function setDraftText(key: string, text: string): void {
  drafts.set(key, { text, attachments: drafts.get(key)?.attachments ?? [] })
}

export function clearDraft(key: string): void {
  drafts.delete(key)
}
