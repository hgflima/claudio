/** "KEY=VALUE" / "Key: Value" lines <-> record. */
export function parsePairs(text: string, sep: '=' | ':'): { value: Record<string, string>; error?: string } {
  const value: Record<string, string> = {}
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const at = line.indexOf(sep)
    if (at <= 0) return { value, error: `Line ${i + 1}: expected ${sep === '=' ? 'KEY=VALUE' : 'Name: value'}` }
    value[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return { value }
}

export const formatPairs = (r: Record<string, string> | undefined, sep: '=' | ':'): string =>
  Object.entries(r ?? {}).map(([k, v]) => (sep === '=' ? `${k}=${v}` : `${k}: ${v}`)).join('\n')

export const parseLines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean)
