import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { McpServerEntry, McpServerStatus } from '@/lib/api'

export function useMcp() {
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [configPath, setConfigPath] = useState('')
  const [statuses, setStatuses] = useState<Record<string, McpServerStatus>>({})

  const refresh = useCallback(async () => {
    const [list, status] = await Promise.all([api.invoke('mcp:list'), api.invoke('mcp:status')])
    setServers(list.servers)
    setConfigPath(list.configPath)
    setStatuses(Object.fromEntries(status.map((s) => [s.name, s])))
  }, [])

  useEffect(() => {
    void refresh()
    // `mcp:changed` fires on every config change and probe result; re-list so renames/edits show up too.
    return api.on('mcp:changed', (status) => {
      setStatuses(Object.fromEntries(status.map((s) => [s.name, s])))
      void api.invoke('mcp:list').then((l) => setServers(l.servers))
    })
  }, [refresh])

  return { servers, configPath, statuses, refresh }
}
