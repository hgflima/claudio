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
