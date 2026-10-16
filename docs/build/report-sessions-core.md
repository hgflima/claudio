# Report — sessions-core

## O que foi feito (`src/main/sessions/`)
| Arquivo | Papel |
|---|---|
| `index.ts` | Registro de sessões + todos os 18 handlers de `SessionsInvoke` (validação zod). Exporta `registerSessions()`, `runningSessionsCount()`, `stopAllSessions()`. |
| `runtime.ts` | `SessionRuntime`: UMA `query()` viva por sessão em streaming input (`InputChannel` AsyncIterable). Fila local (`queued`), recriação com `resume: sdkSessionId` se o processo morrer, fecha o processo após 15 min ocioso (próximo envio retoma). `canUseTool` → PermissionRequest. `interrupt`, `setModel`/`setPermissionMode`/`applyFlagSettings({effortLevel})` na query viva. |
| `normalize.ts` | SDKMessage → TranscriptItem. `stream_event` → item `streaming:true` + `sessions:delta`; a mensagem `assistant` completa finaliza o MESMO id. tool_use, tool_result, init (1x por processo), compact, local_command_output, informational, api_retry, result. Itens em streaming órfãos (interrupt/crash) são finalizados no `result`. |
| `permissions.ts` | Título legível (`Run: …`, `Edit file.ts`, `Fetch url`…), `suggestedRule` (`Bash(npm test:*)`, `Bash(cmd)`, `WebFetch(domain:x)`, nome da tool) e matcher de regras. `AskUserQuestion`/`ExitPlanMode` nunca são auto-aprovados. |
| `trust.ts` | `checkTrust` (bloqueia `/`, home, inexistente, volumes de rede via `mount`; trusted se em `trustedFolders` ou subpasta, com realpath) e `trustFolder` (+ `addRecentFolder`). |
| `cli.ts` | Lista `~/.claude/projects/*/*.jsonl` (cwd das linhas; título = custom-title > ai-title > summary > 1ª msg) e converte em TranscriptItems. |
| `persist.ts` | Meta em `sessions/<id>.json`, transcript em `sessions/<id>.jsonl` (append de itens finais; no load o último de cada id vence). |
| `sdk.ts` | `import()` dinâmico do SDK (ESM em bundle CJS), env do shell **sem `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`**, `pathToClaudeCodeExecutable` = `resolveClaudePath()`; sem `claude` → erro claro, status `error`. |

Detalhes de opções:
- Code: `systemPrompt` preset `claude_code`, `settingSources: ['user','project','local']`, `includePartialMessages`, `mcpServers: getEnabledMcpServers()`, `allowDangerouslySkipPermissions: true` (só para permitir trocar para bypass ao vivo; o modo vem da sessão).
- Chat: cwd = `userData/chat-scratch/<id>`, `tools: []`, `settingSources: []` + `strictMcpConfig: true` (sem hooks/plugins/MCP do CLI; só os MCP do Claudio), system prompt de assistente geral.
- Status: `awaiting-permission` > `running` > `error` (fixo até o próximo envio) > `idle`.
- Interrupt: descarta a fila (item info), resultado vira `Interrupted` sem `lastError`.
- Bus: `session:turn-finished`, `session:permission-requested`, `session:error`.
- `listModels`/`listCommands`: da query viva ou de um processo "probe" (sem enviar prompt, `persistSession:false`) via `initializationResult()`; cache (modelos: sessão do app; comandos: 5 min por cwd); fallback estático de modelos.

## Teste real (feito, assinatura do usuário)
Script: `/private/tmp/claude-501/-Users-henriquelima-dev-personal-claudio/e3cf06d4-17ac-4bae-aeee-81829c29b450/scratchpad/test/run.cjs` e `run2.cjs` — empacotam o módulo real com vite + stub de `electron`.
- `apiKeySource=none` no init → usa a assinatura, não API key. claude 2.1.301.
- "say hi in 3 words" → resposta com streaming; follow-up enviado durante o turno ficou `queued=1` e foi enviado ao fim.
- Bash `echo claudio-ok > perm.txt` → PermissionRequest `Run: echo claudio-ok > perm.txt` → allow (session) → arquivo criado.
- AskUserQuestion → request com perguntas → `updatedInput.answers` → modelo respondeu "Blue".
- Chat: 0 tools. Interrupt no meio de um texto longo → texto parcial finalizado + result "Interrupted".
- Reload: novo processo carregou 3 sessões do disco; envio no chat retomou via `resume` e lembrou a palavra secreta.
- `listModels` (lista real do CLI), `listCommands` (143), `search`, `listCliSessions` (34), `importCli` (85 itens) OK.

## Como testar manualmente (no app)
1. Nova sessão numa pasta → diálogo de trust → enviar "say hi". Ver streaming.
2. Pedir "run `ls` with Bash" → card de permissão → Allow for session → repetir: não pergunta de novo.
3. Enviar 2 mensagens seguidas → "1 queued". Esc → para e descarta a fila.
4. Fechar/reabrir o app → histórico aparece; nova mensagem continua a conversa.
5. Import from CLI → selecionar sessão → histórico convertido; enviar mensagem continua a sessão do CLI.

## Limitações / TODOs
- Mensagens do usuário vindas do SDK (slash commands expandidos, mensagens sintéticas) não viram itens — o item `user` é emitido pelo Claudio no envio.
- Texto/thinking de subagentes não é mostrado (só tool_use com `parentToolUseId`).
- Thinking pode chegar vazio (modelo com thinking omitido): o placeholder é fechado mas não é persistido.
- `usage.inputTokens` soma input + cache (de `modelUsage`, cumulativo por processo/resume); `costUsd` é estimativa do SDK.
- Busca é substring em memória (carrega transcripts sob demanda); sem worker.
- Probe de modelos/comandos abre um processo `claude` temporário (~2–5 s na primeira vez).
- `ExitPlanMode` aprovado: o SDK muda o modo e eu sincronizo `permissionMode` via mensagem `status`.

## Pedidos pendentes
`docs/requests/sessions-core.md`: chamar `stopAllSessions()` no quit; (opcional) `titleSource` no contrato.

---

# Fase 2

## O que foi feito
| Item | Implementação |
|---|---|
| Worktrees | `worktree.ts`. `sessions:create {useWorktree, baseBranch}` (só code): o repo é validado já no create; se a sessão não tem título, o worktree é criado no **1º envio** com slug da 1ª mensagem (`fix-login-bug-run-pwd`), senão no create com slug do título. `git worktree add <repoRoot>/.claude/worktrees/<slug> -b claude/<slug> <base|branch atual>`, slug único (`-2`, `-3`…). Copia arquivos ignorados/untracked que casam com `.worktreeinclude` (globs estilo gitignore). Se o cwd era subpasta do repo, a sessão roda na mesma subpasta dentro do worktree. Item `system info` "Working in worktree …". Trust: só a pasta original é verificada. `sessions:removeWorktree` → `git worktree remove` sem force (com mudanças → erro claro), mantém a branch, `worktree: null`. `sessions:delete` → remove com `--force` (branch mantida). Arquivar não mexe. |
| Fork | `sessions:fork`. Itens persistidos agora guardam o `sdkUuid` da cadeia principal (assistant/tool_result do SDK; uuid de cliente nos `user`; CLI import usa o `uuid` da linha). Fork num item de turno → mantém o turno inteiro até o `result` (nenhum tool_use fica pendurado) e usa `resumeSessionAt` = último uuid não-user; fork num item `user` → continua de antes dessa mensagem. Sem `atItemId` → fork completo. Aplicado no 1º envio (`resume` + `forkSession: true`), e o novo `sdkSessionId` é capturado. Transcript copiado até o corte, `forkedFrom`, título "Fork of …". O fork não herda o worktree (fica com a sessão de origem). |
| Context usage | `sessions:contextUsage`: `query.getContextUsage()` na query viva; senão estima pelo último `usage` (input+cache) / 1M (`[1m]`) ou 200k. |
| Keep awake | **Removido** a pedido do orquestrador (o shell faz via bus `session:turn-started`). |
| Bus | `session:changed` (todo upsert de meta, junto do IPC), `session:removed`, `session:turn-started` (cada turno despachado), além de turn-finished/permission/error. |
| Internal API | `createAndSend({kind, cwd, text, title?, model?, permissionMode?, useWorktree?})` exportado de `sessions/index.ts`: sem prompt de trust, mas recusa pastas bloqueadas; worktree nomeado pelo título ou texto. |
| MCP interno | `visualize.ts`: servidor in-process `visualize` com `show_widget({title, widget_code, loading_messages?})` → "Widget rendered", descrição orienta (SVG/HTML autocontido, sem rede, ~680px, CSS vars `--bg/--fg/--fg-muted/--border/--accent/--code-bg`). Em todas as sessões (instância nova por query). Sessões code recebem `scheduled-tasks` de `getAutomationMcpServer({ cwd: pasta original })`. `mcp__visualize__*` e `mcp__scheduled-tasks__list*` são auto-aprovados. |
| Contrato | `titleSource` agora vai ao renderer. Campos internos (`forkSource`, `pendingWorktree`, `sdkUuid`) não saem do main. |

## Teste real (scratchpad `test/run3.cjs`, `run4.cjs`, assinatura, `apiKeySource=none`)
- Worktree a partir de `repo/sub` sem título → `claude/fix-login-bug-run-pwd` de `main`; `pwd` do Bash = `…/.claude/worktrees/fix-login-bug-run-pwd/sub`; `.env.local` copiado.
- `show_widget` e `list_scheduled_tasks` rodaram **sem** pedido de permissão.
- Pasta sem git → "Worktrees need a git repository…". Worktree com arquivo sujo → erro claro; depois de limpo, removido e a branch mantida.
- Fork parcial (no 1º assistant) → "ALPHA"; fork completo → "ALPHA, BETA" com outro `sdkSessionId`; a sessão original continuou ("ALPHA, BETA, GAMMA").
- `contextUsage` ao vivo: `{usedTokens: 41206, maxTokens: 1000000, percent: 4}`.
- `createAndSend` com worktree → "READY"; delete removeu o worktree.
- Bus: changed ×4, turn-started ×1, turn-finished ×1, removed ×1 num ciclo create/send/delete.

## Limitações Fase 2
- Depois de `removeWorktree` o `cwd` da sessão continua apontando para o worktree removido → novos envios dão "Folder not found" (de propósito: o resume do SDK depende do cwd original). A UI pode oferecer um fork ou uma sessão nova.
- `.worktreeinclude`: arquivos dentro de pastas totalmente ignoradas (ex. `node_modules/`) não são listados (uso `ls-files --directory` para não varrer pastas enormes).
- Fork de uma sessão com worktree aponta para o mesmo worktree, sem ser dono dele.
