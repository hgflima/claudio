# Pedidos do agente `panels`

## 1. (baixa prioridade) chmod do spawn-helper do node-pty no postinstall
**O quê:** `node_modules/node-pty/prebuilds/<plat>-<arch>/spawn-helper` foi instalado sem bit de execução (`-rw-r--r--`) → `posix_spawnp failed` ao abrir terminal.
**Contorno atual:** `src/main/workspace/terminal.ts` faz `chmod 755` em runtime no `registerWorkspace()` (já aplicado no ambiente de dev durante o teste). Funciona em dev; no app empacotado o `asarUnpack` já cobre node-pty, mas o diretório do bundle pode ser read-only.
**Diff sugerido (package.json):**
```diff
-    "postinstall": "electron-builder install-app-deps",
+    "postinstall": "electron-builder install-app-deps && chmod +x node_modules/node-pty/prebuilds/*/spawn-helper 2>/dev/null || true",
```

## 2. (Fase 2, para sessions-core) integração com automation
- **`createAndSend`**: o scheduler chama `createAndSend({ kind, cwd, text, title, model?, permissionMode, useWorktree? }) → Promise<SessionMeta>` exportado de `src/main/sessions/index.ts` (assinatura do stub do orquestrador). Até existir, "Run now" e disparos falham com erro claro e `lastStatus:'error'`.
- **`getAutomationMcpServer(defaults?: { cwd?: string | null })`** (de `src/main/automation`): passe `{ cwd: meta.cwd }` para que `create_scheduled_task` sem `cwd` use a pasta da sessão. Retorna uma instância NOVA por chamada (um McpServer não pode ser conectado a duas sessões) — chame uma vez por query/sessão e coloque em `mcpServers['scheduled-tasks']`.
- `bus.emitBus('session:turn-finished')` precisa ser emitido também para sessões criadas por tarefas (é o que fecha o run como success/error).
