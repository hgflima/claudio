// Owner: agent "panels". Terminal (node-pty), git, file search.
import { registerTerminal } from './terminal'
import { registerGit } from './git'
import { registerFiles } from './files'

export function registerWorkspace(): void {
  registerTerminal()
  registerGit()
  registerFiles()
}
