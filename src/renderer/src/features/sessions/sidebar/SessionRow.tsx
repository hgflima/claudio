import { memo, useRef, useState, type MouseEvent } from 'react'
import { Archive, ArchiveRestore, Ellipsis, GitBranch, GitFork, LoaderCircle, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { SessionMeta } from '@shared/ipc'
import { deleteSession, errMsg, forkSession, openSession, removeWorktree, updateSession } from '../store'
import { basename } from '../util'
import { ConfirmDialog } from '../ui/Dialog'
import { MenuItem, Popover } from '../ui/Popover'

interface Props {
  session: SessionMeta
  active: boolean
  snippet?: string
}

export const SessionRow = memo(function SessionRow({ session, active, snippet }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmWorktree, setConfirmWorktree] = useState(false)

  const openMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const subtitle =
    snippet ??
    (session.worktree
      ? `${basename(session.worktree.originCwd)} · ${session.worktree.branch}`
      : session.cwd
        ? basename(session.cwd)
        : 'Chat')

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !renaming && openSession(session.id)}
        onKeyDown={(e) => e.key === 'Enter' && !renaming && openSession(session.id)}
        onContextMenu={openMenu}
        className={cn(
          'group relative flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none',
          active ? 'bg-bg-hover' : 'hover:bg-bg-hover/70 focus-visible:bg-bg-hover/70'
        )}
      >
        <div className="min-w-0 flex-1">
          {renaming ? (
            <RenameInput
              initial={session.title}
              onDone={async (title) => {
                setRenaming(false)
                if (title && title !== session.title) await updateSession(session.id, { title }).catch(() => {})
              }}
            />
          ) : (
            <div className="truncate text-[13px] text-fg">{session.title || 'Untitled'}</div>
          )}
          <div className="flex items-center gap-1 truncate text-[11.5px] text-fg-subtle">
            {!session.cwd && !snippet && <MessageCircle className="size-3 shrink-0" />}
            {session.worktree && !snippet && <GitBranch className="size-3 shrink-0" />}
            <span className="truncate">{subtitle}</span>
          </div>
        </div>
        <StatusDot session={session} />
        <button
          type="button"
          aria-label="Session actions"
          onClick={openMenu}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg hover:text-fg',
            menu ? 'flex' : 'hidden group-hover:flex'
          )}
        >
          <Ellipsis className="size-4" />
        </button>
      </div>

      <Popover anchor={menu} onClose={() => setMenu(null)}>
        <MenuItem icon={<Pencil className="size-3.5" />} onClick={() => { setMenu(null); setRenaming(true) }}>
          Rename
        </MenuItem>
        <MenuItem
          icon={session.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
          onClick={() => {
            setMenu(null)
            void updateSession(session.id, { archived: !session.archived }).catch(() => {})
          }}
        >
          {session.archived ? 'Unarchive' : 'Archive'}
        </MenuItem>
        <MenuItem
          icon={<GitFork className="size-3.5" />}
          onClick={() => {
            setMenu(null)
            forkSession(session.id).catch((e) => console.error(errMsg(e)))
          }}
        >
          Fork
        </MenuItem>
        {session.worktree && (
          <MenuItem icon={<GitBranch className="size-3.5" />} onClick={() => { setMenu(null); setConfirmWorktree(true) }}>
            Remove worktree
          </MenuItem>
        )}
        <MenuItem danger icon={<Trash2 className="size-3.5" />} onClick={() => { setMenu(null); setConfirmDelete(true) }}>
          Delete
        </MenuItem>
      </Popover>

      {session.worktree && (
        <ConfirmDialog
          open={confirmWorktree}
          danger
          title="Remove worktree?"
          body={
            <>
              The folder <code className="font-mono text-xs">{session.worktree.path}</code> will be removed. The branch{' '}
              <code className="font-mono text-xs">{session.worktree.branch}</code> is kept.
            </>
          }
          confirmLabel="Remove worktree"
          onCancel={() => setConfirmWorktree(false)}
          onConfirm={() => {
            setConfirmWorktree(false)
            removeWorktree(session.id).catch((e) => console.error(errMsg(e)))
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Delete session?"
        body={<>“{session.title || 'Untitled'}” will be permanently removed from Claudio.</>}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          deleteSession(session.id).catch((e) => console.error(errMsg(e)))
        }}
      />
    </>
  )
})

function StatusDot({ session }: { session: SessionMeta }) {
  if (session.status === 'running')
    return <LoaderCircle aria-label="Running" className="size-3.5 shrink-0 animate-spin text-fg-muted" />
  if (session.status === 'awaiting-permission')
    return <span aria-label="Needs input" className="size-2 shrink-0 rounded-full bg-accent" />
  if (session.status === 'error') return <span aria-label="Error" className="size-2 shrink-0 rounded-full bg-danger" />
  return null
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (v: string) => void }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (v: string) => {
    if (done.current) return
    done.current = true
    onDone(v.trim())
  }
  return (
    <input
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(initial)
      }}
      className="w-full rounded-md border border-accent bg-bg-elevated px-1.5 py-0.5 text-[13px] outline-none"
    />
  )
}
