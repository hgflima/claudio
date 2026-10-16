import { stat } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'

/** Resolves and checks that `cwd` is an existing absolute directory. */
export async function assertDir(cwd: unknown): Promise<string> {
  if (typeof cwd !== 'string' || !cwd || !isAbsolute(cwd)) throw new Error('cwd must be an absolute path')
  const abs = resolve(cwd)
  const st = await stat(abs).catch(() => null)
  if (!st?.isDirectory()) throw new Error(`Directory not found: ${abs}`)
  return abs
}

/** Ensures a relative path stays inside `root`. Returns the normalized relative path. */
export function assertInside(root: string, rel: string): string {
  const abs = resolve(root, rel)
  if (abs !== root && !abs.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('Path escapes cwd')
  return abs.slice(root.length + 1)
}
