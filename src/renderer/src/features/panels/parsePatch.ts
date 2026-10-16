export type DiffLine =
  | { kind: 'hunk'; text: string }
  | { kind: 'add' | 'del' | 'ctx'; text: string; oldNo: number | null; newNo: number | null }
  | { kind: 'meta'; text: string }

export interface ParsedPatch { lines: DiffLine[]; binary: boolean; additions: number; deletions: number }

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

/** Parses a unified patch (one or many files) into renderable rows with line numbers. */
export function parsePatch(patch: string): ParsedPatch {
  const out: ParsedPatch = { lines: [], binary: false, additions: 0, deletions: 0 }
  let oldNo = 0
  let newNo = 0
  let inHunk = false
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git ')) { inHunk = false; continue }
    const m = HUNK_RE.exec(raw)
    if (m) {
      inHunk = true
      oldNo = Number(m[1])
      newNo = Number(m[2])
      out.lines.push({ kind: 'hunk', text: raw })
      continue
    }
    if (!inHunk) {
      if (raw.startsWith('Binary files')) { out.binary = true; out.lines.push({ kind: 'meta', text: 'Binary file changed' }) }
      continue
    }
    if (raw.startsWith('+')) { out.additions++; out.lines.push({ kind: 'add', text: raw.slice(1), oldNo: null, newNo: newNo++ }) }
    else if (raw.startsWith('-')) { out.deletions++; out.lines.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++, newNo: null }) }
    else if (raw.startsWith(' ')) out.lines.push({ kind: 'ctx', text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ })
    else if (raw.startsWith('\\')) out.lines.push({ kind: 'meta', text: raw.slice(2) })
  }
  return out
}
