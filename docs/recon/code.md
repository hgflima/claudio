# Recon — Claude Code & Cowork (Claude Desktop v2.42304.0)

Área: sessões de código locais, Cowork (agent mode), tarefas agendadas, live artifacts, worktrees, terminal embutido, permissões, workers utilitários, consentimento local, janela de Design.

Legenda: **[O]** = observado no código/arquivos · **[I]** = inferido.
Base de evidência: ASAR extraído em `.../scratchpad/asar/.vite/build/` (abaixo, caminhos relativos a `build/`). Main process = `index.chunk-muI2IV6k.js` (7 MB, abreviado como **MAIN**). Preload da UI = `mainView.js`.

> Contexto importante [O]: a UI de chat/Code/Cowork é o claude.ai remoto rodando no BrowserView. O shell local expõe tudo via IPC tipado ("eipc"): canais `$eipc_message$_8a0a627c-…_$_claude.web_$_<Interface>_$_<método>`. O renderer remoto chama `window["claude.web"].<Interface>.<método>()`. Ou seja: **a UI de Code/Cowork NÃO está no ASAR** — só o backend. O clone terá de escrever a UI do zero.

---

## 1. Tabela de funcionalidades

| ID | Funcionalidade | Descrição do comportamento para o usuário | Evidência | Compl. | MVP |
|---|---|---|---|---|---|
| CC-01 | Sessão Claude Code local | Usuário escolhe pasta (cwd), digita prompt e uma sessão do Claude Code roda localmente; streaming de mensagens/ferramentas na UI. | IPC `LocalSessions.start(info)` — `info` exige `cwd`, `message`; opcionais `model`, `permissionMode`, `useWorktree`, `sourceBranch`, `systemPrompt`, `mcpServers`, `effort`, `fastMode`, `agent`, `additionalDirectories`… (validador `JAt` em MAIN). SDK embutido: `@anthropic-ai/claude-agent-sdk` v0.3.299 em `index.chunk-DNyequwM.js` | G | Must |
| CC-02 | Binário Claude Code gerenciado | App baixa/gerencia o binário nativo do CLI por versão, com checagem sha256 e de arquitetura Mach-O. | MAIN: `userData/claude-code/<ver>` (fn `xAr`), "Claude Code checksum … sha256", `MAr` valida magic Mach-O/arch. Em disco: `~/Library/Application Support/Claude/claude-code/2.1.299`, `claude-code-vm/2.1.299` | M | Must (no clone: usar `claude` do PATH ou SDK) |
| CC-03 | Enviar mensagem / fila / steering | Enviar follow-ups com imagens, anexos, pastes; mensagens ficam em fila e podem ser reordenadas, promovidas ou enviadas "agora" (steer). | `LocalSessions.sendMessage(sessionId,message,images,attachments,priority,steeringGates,…)`, `cancelQueuedMessage`, `reorderQueuedMessage`, `promoteQueuedMessage`, `sendSteeredNow` | M | Must (fila simples) |
| CC-04 | Interromper / parar | Botão para interromper turno ou parar sessão; parar tarefa de background. | `interrupt`, `stop`, `stopTask`, `getTaskOutput`, `backgroundTasks` | P | Must |
| CC-05 | Modelo, esforço, fast mode, thinking | Trocar modelo, nível de effort, fast mode e resumo de thinking por sessão. | `setModel`, `setEffort`, `getDefaultEffort`, `setFastMode`, `setThinkingSummariesWanted` | P | Must (modelo) / Should (resto) |
| CC-06 | Modos de permissão | Seletor de modo: default, acceptEdits, plan, bypassPermissions, dontAsk, auto. Bypass pede confirmação ("Run coding task in bypass permissions mode?"). | MAIN `LDt=new Set(["default","acceptEdits","plan","bypassPermissions","dontAsk","auto"])`; `setPermissionMode`, `getDefaultPermissionMode`; i18n `RHad/9n4zb` | M | Must |
| CC-07 | Prompt de permissão de ferramenta | Quando o agente quer usar uma ferramenta, aparece prompt Allow/Deny (com "Allow for this session"); resposta pode editar o input. | Evento `onToolPermissionRequest`; `respondToToolPermission(requestId, decision, updatedInput)`; i18n `XOA7iEPZuB` "Allow for this session"; SDK flag `--permission-prompt-tool=stdio` | M | Must |
| CC-08 | Confiança de pasta (trust) | Antes de abrir sessão numa pasta nova: "Trust {cwd} and start a code session?". Pastas confiáveis são lembradas. | `checkTrust`, `checkStoredTrust`, `saveTrust`, `answerPendingCwdTrust`; i18n `PDCixSwULY` | P | Must |
| CC-09 | Worktrees por sessão | Opção "usar worktree": a sessão roda num git worktree isolado em `<repo>/.claude/worktrees/<nome>`, branch `claude/<slug>` gerado pelo modelo. Pool de worktrees reaproveitáveis com lease por sessão. Copia arquivos ignorados listados em `.worktreeinclude` e config `.claude/`. | `start.info.useWorktree/sourceBranch/branchHint`; `index.chunk-BAdej_RQ.js` `[GitWorktreeManager]`, `[worktreeOverlay] .worktreeinclude`; regex de path `.claude/worktrees`; prompt "branch name … start with \"claude/\"" (MAIN @4356405); `userData/git-worktrees.json` (`schemaVersion`,`worktrees`,`untrackedDirGc`); `discardKeptWorktree`, `setAccountBranchPrefix` | G | Should |
| CC-10 | Diff / revisão de mudanças | Painel com diff vs. base, stats, lista de commits, diff por arquivo (inclui imagens), mudanças não commitadas. | `getGitDiff`, `getGitDiffStats`, `getDiffFileContent`, `getDiffFileImage`, `getGitDiffFilePatch`, `getGitCommits`, `getCommitDiff`, `getUncommittedChanges`; executado no `heavy-work-worker` (`gitDiff`, `gitWorkingTreeDiff`, `gitCommits`…) | M | Should |
| CC-11 | Integração GitHub (PR) | Ver checks, comentários, timeline, arquivos do PR; responder/resolver threads; mergear, auto-merge, ready/draft; auto-fix de PR; listar issues. Requer `gh`. | `checkGhAvailable`, `installGh`, `getPrChecks`, `getPrReviewComments`, `replyToPrReviewComment`, `resolvePrReviewThread`, `submitPrReview`, `mergePr`, `enableAutoMerge`, `markPrReady`, `setBoundPrAutoFix`, `listGhIssues` | G | Later |
| CC-12 | Troca de branch segura | Detecta árvore suja e oferece stash / commit WIP / descartar antes de trocar branch. | `isWorkingTreeDirty`, `checkBranchSwitchConflict`, `stashWorkingTree`, `commitWipForBranchSwitch`, `discardWorkingTree`, `getLocalBranches` | M | Later |
| CC-13 | Terminal embutido | Painel de terminal (Show/Hide Terminal) por sessão, com abas, escolha de shell, título, resize; output com scrollback persistido em disco e grep-ável pelo agente. | `startShellPty(sessionId,cols,rows,spawnReason,ownerCwd,linkAware,options{shell,hostShellAware})`, `writeShellPty`, `resizeShellPty`, `stopShellPty`, `getTerminalShells` → `{id,name}[]`, `setShellPtyTitle`, `getBusyShellPtyKeys`; worker `pty-host/ptyHostWorker.js` (node-pty); i18n `wBOWq9/ltQ`/`98WeOhhkzv` | M | Must |
| CC-14 | Rodar comando bash avulso | Usuário roda comando shell direto no contexto da sessão (modo "!") e pode interromper. | `runBashCommand(sessionId,command)`, `interruptBashCommand` | P | Should |
| CC-15 | Lista de sessões / histórico | Sidebar com sessões; arquivar/desarquivar, deletar, renomear, grupos customizados, reabrir sessão fechada (⌘⇧T), ciclar sessões. | `getAll`, `getSessionList`, `archive`, `unarchive`, `delete`, `updateSession`, `setCustomGroups`, `loadArchivedSessions`; menu "Reopen Closed Session" ⌘⇧T; `MenuEvents.cycleSession` | M | Must |
| CC-16 | Busca em transcrições | Buscar texto em todas as sessões; retorna snippet e data de atividade. | `searchSessions`; `transcript-search-worker` msg `search` → `{sessionId,snippet,lastActivityAt}`; lê JSONL, 4 arquivos em paralelo, contexto 20/80 chars | M | Should |
| CC-17 | Carregar transcrição (paginado) | Abrir sessão carrega a cauda da transcrição e pagina para trás; lida com compaction boundaries. | `getTranscript`, `getTranscriptTail`, `getTranscriptPage`, `requestTranscriptPort`; heavy-work `transcriptTail/transcriptNewestPage/transcriptDeliver` via MessagePort em chunks; transcript-worker `readTranscript` (estratégias none/preserved/compaction/tail, limite 50 MB) | M | Must (versão simples) |
| CC-18 | Rewind / fork / clear | Voltar a um ponto (incl. restaurar arquivos), desfazer rewind, forkar sessão a partir de uma mensagem, limpar contexto. | `rewind`, `rewindFiles`, `undoRewind`, `forkSession(parentSessionId,…,forkAtMessageUuid,targetCwd)`, `clearSession`, `resumePreClearSession` | M | Should (fork/clear) / Later (rewind de arquivos) |
| CC-19 | Side chat / "btw" | Chat lateral paralelo (⌘\\) sem poluir a sessão principal. | `startSideChat`, `sendSideChatMessage`, `stopSideChat`, `startBtwChild`; menu "Side Chat" ⌘\\ | M | Later |
| CC-20 | Uso de contexto | Indicador de quanto do contexto foi usado. | `getContextUsage`, `getContextUsageSummary` | P | Should |
| CC-21 | Slash commands / agents / output styles | Menu de slash commands da sessão; listar/criar subagents; criar output styles. | `getSupportedCommands`, `getAgents`, `createAgent`, `createOutputStyle`, `listGlobalOutputStyles` | M | Should (slash) / Later |
| CC-22 | MCP por sessão | Habilitar servidores/ferramentas MCP por sessão; autenticar OAuth; chamar ferramenta. | `setMcpServers`, `replaceEnabledMcpTools`, `mcpAuthenticate`, `mcpReconnect`, `mcpCallTool`, `getSessionCliMcpServers` | M | Should |
| CC-23 | Arquivos da sessão / @-menções | Picker de arquivo no cwd, listagem de diretório, preview de arquivo/imagem/mídia, abrir no editor externo, @-mencionar arquivos (fuzzy). | `pickFileAtCwd`, `readFileAtCwd`, `listDirectoryAtCwd`, `getInstalledEditors`, `openInEditor`; `Resources.fetchMentionOptions`, `getProjectFileList`, `searchFileContents`; `file-index-worker` (fuzzy index + `rg`/`git grep`) | M | Must (@arquivo) |
| CC-24 | Importar sessões do CLI | Importar sessões de `~/.claude` iniciadas no terminal; retomar sessão CLI. | `importAllCliSessions`, `listCliSessions`, `resumeCliSession`, `previewCliResume`; menu "Import Claude Code CLI Sessions…"; i18n `j4ih4+6F9S` | M | Should (é barato com o mesmo formato JSONL) |
| CC-25 | Comando `ccd` no terminal | Instala symlink `/usr/local/bin/ccd` → script do app para abrir sessões pelo terminal. | MAIN `F7="/usr/local/bin/ccd"`, dialog "Install the ccd terminal command?"; IPC `CcdCli.getCcdCliStatus/installCcdCli/uninstallCcdCli` | P | Later |
| CC-26 | Deep links & ações do dock | `claude://code/new`, `claude://code/continue?session=last`, `claude://code/needs-input`, `claude://claude.ai/new?surface=chat`. Viram jump-list/dock actions. | MAIN @3788059 (`n_r`) | P | Should |
| CC-27 | SSH / WSL remoto | Sessões de código em host SSH ou distro WSL; trust de host key, senha, diagnóstico. | `testSSHConnection`, `getSSHConfigs`, `listWslDistros`, `getSSHGitDiff`…; dezenas de strings i18n de SSH | G | Later |
| CC-28 | Preview de app (Launch) | Painel de preview do dev server com abas, viewport, screenshot, inspeção de elemento, logs de console; config em `.claude/launch.json` (`runtimeExecutable`, `runtimeArgs`, `port`, `url`), auto-detect de candidatos. | IPC `Launch.*` (108 métodos: `startFromConfig`, `showPreview`, `detectServerCandidates`, `capturePreviewScreenshot`, `previewConsoleLogs`, `toggleSelectionMode`…); template launch.json em MAIN @3091625 | G | Later |
| CC-29 | Teleport para nuvem / Remote Control | Mover sessão para cloud; permitir que celular/claude.ai iniciem sessões nesta máquina em pastas confiáveis. | `teleportToCloud`, `toggleRemoteControl`; IPC `RemoteControlServing.*`; i18n `+4ABv8PeZM`, `6pkVEZ470b` | G | Later (depende do backend Anthropic) |
| CC-30 | Sandbox local | Liga/desliga sandbox do Claude Code e modo estrito. | `ClaudeCode.setLocalSandboxEnabled`, `setStrictSandboxMode`, `getLocalSandboxStatus` | M | Later |
| CW-01 | Cowork (agent mode) | Tarefas "não-código" com acesso a pastas escolhidas: agente lê/edita arquivos, gera outputs, usa skills/plugins/Chrome. Roda numa VM leve (macOS 14+, virtualização) ou em "host loop mode". | IPC `LocalAgentModeSessions.*` (126 métodos); `ClaudeVM.*`; `Resources/smol-bin.arm64.img`; i18n "Cowork requires macOS 14.0…", "Allow Claude to cowork in {path}?" | G | Should (sem VM: rodar SDK direto no host) |
| CW-02 | Pastas confiáveis do Cowork | Usuário concede acesso a pastas; pastas viram trusted também no Code. | `addTrustedFolder`, `browseAndAddTrustedFolder`, `removeTrustedFolder`, `isFolderTrusted`; i18n `QDuKwStziw` | P | Should |
| CW-03 | Outputs e uploads | Cada tarefa tem diretório próprio com `outputs/`, `uploads/`, `audit.jsonl`; botão abrir outputs. | Em disco: `local-agent-mode-sessions/<org>/<acct>/local_<uuid>/{outputs,uploads,audit.jsonl}`; `openOutputsDir` | P | Should |
| CW-04 | Skills locais | Listar, salvar (zip/SKILL.md), renomear, habilitar, deletar skills. | `listLocalSkills`, `saveLocalSkill`, `saveLocalSkillArchive`, `setLocalSkillEnabled`, `deleteLocalSkill` | M | Should |
| CW-05 | Spaces (projetos Cowork) | Agrupar pastas, projetos e links num "Space" com memória própria. | IPC `CoworkSpaces.*` (`createSpace`, `addFolderToSpace`, `readSpaceMemoryIndex`…); `spaces.json` | M | Later |
| CW-06 | Memória | Memória global e por conta, editável, resetável. | IPC `CoworkMemory.*` (`readGlobalMemory`, `writeGlobalMemory`, `listAccountMemories`, `resetMemories`) | P | Later |
| CW-07 | Limpeza de disco / storage | Ver uso e limpar caches de sessões Cowork; exportar tarefa/projeto. | `CoworkStorage.*`, `DeviceStorage.previewCodeCleanup/runCodeCleanup`; menu "Free Up Cowork Disk Space…" | P | Later |
| ST-01 | Tarefas agendadas (Cowork e Code) | Criar tarefa com prompt + cron (`cronExpression`) ou disparo único (`fireAt`); habilitar/desabilitar; editar; ver histórico de execuções; rodar manualmente. Cada execução cria nova sessão. | IPC `CoworkScheduledTasks.*` e `CCDScheduledTasks.*` (`createScheduledTask`, `updateScheduledTask`, `updateScheduledTaskStatus`, `getAllScheduledTasks`, `getScheduledTaskFileContent`, `getWatcherHistory`, evento `onScheduledTaskEvent`); `getSessionsForScheduledTask` | M | Should |
| ST-02 | MCP "scheduled-tasks" para o agente | O próprio agente pode criar/editar/listar/rodar tarefas agendadas e "watchers". | MAIN @2247629: `mcp__scheduled-tasks__{create,update,delete,list}_scheduled_task`, `run_scheduled_task`, `list_task_runs`, `start_watching`, `stop_watching` | M | Should |
| ST-03 | Aprovações persistentes por tarefa | Permissões aprovadas ficam salvas na tarefa e podem ser revogadas. | campo `approvedPermissions`; `removeApprovedPermission`, `clearChromePermissions` | P | Later |
| LA-01 | Live artifacts (Cowork) | Artifacts HTML gerados pelo agente abrem numa janela/painel isolado, com libs locais (Chart.js 4.5, Grid.js 5, Mermaid 11), podem chamar ferramentas MCP, perguntar ao Claude e disparar tarefa agendada. Versões, estrela, renomear, PDF, compartilhar. | `coworkArtifact.js` expõe `window.cowork.{callMcpTool, askClaude, runScheduledTask}`; protocolo `cowork-artifact://local/<id>/…`; partição `persist:cowork-artifact`; IPC `CoworkArtifacts.*` (25 métodos); dir `<userData>/…/Artifacts`, `artifacts.json`; share → `claude://cowork/shared-artifact?uuid=` | G | Later (MVP: só renderizar HTML em iframe sandbox) |
| LA-02 | Watcher artifacts de tarefa | Arquivos JS/JSON produzidos por tarefa agendada (pasta `Scheduled/<taskId>`) servidos ao artifact. | handler `cowork-artifact` (MAIN @5787537) caminho `Scheduled/<id>` | M | Later |
| UI-01 | Consentimento local (janela nativa) | Diálogo nativo dependente-zero para: conectar/desconectar conector MCP direto, conceder uso de conector no chat, aplicar configurações da org. | `localExecConsent.js` + `renderer/local_exec_consent/`; kinds `connect`/`disconnect`/`chat-grant`/`apply`; IPC `claude.internal.localExecConsent.LocalExecConsent.choose("allow"|"cancel")`; botão Allow desabilitado 500 ms após foco (anti-clickjacking) | P | Later |
| UI-02 | Janela de Design (PDF) | Janela para claude.ai Design ("omelette") com bridge para imprimir frame em PDF. | `designWindow.js`: `window.omeletteDesktopPdf.printFrameToPdf({origin,nonce,docTitle,paper})`; só origens claude.ai/claude.com/localhost | P | Later |
| UI-03 | Atalhos & menus de Code | ⌘N New Session/Task, ⌘K Command Palette, ⌘B Sidebar, ⌘\\ Side Chat/Close Pane, ⌘⇧T Reopen Closed Session, ⌘⇧O Open Folder, ⌘/ Keyboard Shortcuts, ⌘F Find. | MAIN accelerators + labels; IPC `MenuEvents.*` | P | Must (subset) |
| UI-04 | Notificações "needs input" | Notificação nativa quando sessão aguarda o usuário; aviso ao sair com sessões rodando. | `DesktopNotifications.*`, `setProjectPromptsWaiting`; i18n `V9Eb08nwTF` "Claude is working in {count} sessions…" | P | Should |

---

## 2. Detalhes técnicos para reimplementar

### 2.1 Arquitetura de processos [O]
- **Main** coordena sessões e IPC. Trabalho pesado vai para **utility processes** (Electron `utilityProcess`) que recebem uma `MessagePort` na mensagem `{type:"init"}`:
  - `pty-host/ptyHostWorker.js` — PTYs (node-pty).
  - `shell-path-worker/shellPathWorker.js` — extrai env do shell de login.
  - `transcript-search-worker` — busca e leitura de transcrições.
  - `file-index-worker` — índice fuzzy de arquivos + busca de conteúdo.
  - `heavy-work-worker` — git, diffs, exports, transcrições grandes.
- Para o Claudio: replicar com `utilityProcess.fork` + `MessageChannelMain`. Padrão request/response: `{requestId, type|task, params}` → `{type:"result"|"error", requestId, …}`.

### 2.2 pty-host — protocolo [O]
Mensagens de entrada: `spawn {ptyId,file,args,opts{name,cols,rows,cwd,env,scrollbackLogDir?,scrollbackRedact?,windowsFallbackFile?}}`, `write {ptyId,data}`, `resize {ptyId,cols,rows}`, `kill`, `read-scrollback {ptyId,requestId,offsetLines,lines,grep}`, `dispose-scrollback`, `shutdown`.
Saída: `spawned {ptyId,pid}`, `data {ptyId,data}`, `exit {ptyId,exitCode}` (sinal → 128+sig), `spawn-error`, `spawn-fallback`, `scrollback-read {result}`.
Scrollback: grava em segmentos `N.log` (4 Mi chars cada, máx. 16), remove sequências ANSI ao ler, redige segredos (substitui por `*`), marca `[... earlier output not kept ...]`. Leitura em janela (máx. 100 KB) ou grep com 2 linhas de contexto e até 40 matches. **[I]** Isso existe para o agente ler o terminal do usuário.

### 2.3 shell-path-worker [O]
Executa `$SHELL -l -i -c 'echo MARK; env -0 && echo END || env'` (timeout 4 s) com env mínimo + `DISABLE_AUTO_UPDATE=true`, `ZSH_DISABLE_COMPFIX=true`, `CLAUDE_DESKTOP_RESOLVING_ENVIRONMENT=1`. Faz o parse do env e remove `PWD/OLDPWD/SHLVL/_`. Ordem de fallback: `$SHELL` → zsh (se `.zshrc`) → bash → sh. **Essencial no clone**: apps GUI no macOS não herdam o PATH do usuário, então sem isso o `claude`/`git` não são encontrados.

### 2.4 Integração com Claude Code [O]
- Embute `@anthropic-ai/claude-agent-sdk` **0.3.299** (`CLAUDE_AGENT_SDK_VERSION`, `CLAUDE_CODE_ENTRYPOINT=sdk-ts`). Flags do CLI vistas: `--permission-prompt-tool=stdio`, `--resume`, `--continue`, `--allowedTools`, `--disallowedTools`, `--json-schema`, `--channels`, `--debug-file`; `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true` (habilita o rewind de arquivos).
- O binário nativo fica em `userData/claude-code/<versão>` (no disco do usuário: 2.1.299). Há um binário separado em `claude-code-vm/` para o Cowork.
- **Clone**: usar `@anthropic-ai/claude-agent-sdk` (`query()` com `canUseTool` para os prompts de permissão; `resume` para continuar), apontando `pathToClaudeCodeExecutable` para o `claude` do PATH resolvido. Isso autentica com a assinatura do usuário.

### 2.5 Persistência (userData = `~/Library/Application Support/Claude`) [O]
- `claude-code-sessions/<orgId>/<accountId>/local_<uuid>.json` — metadados da sessão Code. Chaves: `sessionId, cliSessionId, cwd, originCwd, title, titleSource, model, effort, permissionMode, enabledMcpTools, remoteMcpServersConfig, sessionPermissionUpdates, alwaysAllowedReasons, chromePermissionMode, isArchived, createdAt, lastActivityAt, lastFocusedAt, completedTurns, spawnSeed, classifierSummaryEnabled`.
- `claude-code-sessions/<org>/<acct>/scheduled-tasks.json` — `{scheduledTasks[], recordedSkips, dayFieldsOrBoundaryStamped, …}`.
- `local-agent-mode-sessions/<org>/<acct>/local_<uuid>.json` (+ pasta com `outputs/ uploads/ audit.jsonl`), `spaces.json`, `scheduled-tasks.json`, `artifacts.json`, `artifacts/`.
- `git-worktrees.json` — `{schemaVersion, worktrees, untrackedDirGc}` (modo de arquivo 0600).
- A transcrição propriamente dita é o JSONL do CLI (`cliSessionId`) em `~/.claude/projects/…` **[I]** (o worker lê JSONL com `type: user|assistant|system`, `compact_boundary`, `parentUuid`).

### 2.6 Schema de tarefa agendada (validador `bv` em MAIN) [O]
`id, displayName?, cronExpression?, fireAt?(ms), enabled, lastRunAt?, filePath, createdAt, model?, userSelectedFolders?, userSelectedFiles?, userSelectedProjectUuids?, chromePermissionMode?, chromeAllowedDomains?, spaceId?, cwd?, place?{remoteTarget,cwd}, useWorktree?, sourceBranch?, permissionMode?, approvedPermissions?, disableJitter?, …`. Payload de criação: `name, displayName?, prompt, description, cronExpression?|fireAt?, model?, userSelectedFolders?…`.
**[I]** `filePath` aponta para um arquivo markdown com o prompt da tarefa (`getScheduledTaskFileContent`). Há "jitter" no disparo (`disableJitter`). `WakeScheduler` (Swift nativo) acorda o Mac para rodar tarefas.

### 2.7 Worktrees [O]
- Local: `<repo>/.claude/worktrees/<nome>` (nome casa `^[a-z0-9][a-z0-9-]*$`). Branch: o modelo gera um nome `claude/<até-4-palavras>` junto com o título da sessão.
- Pool com lease por sessão, "tombstones" para remoção diferida e "pin" da origem git (só mescla arquivos protegidos `.claude`, `.mcp.json` vindos do branch default da origem pinada; i18n `mnYepCeDw1`).
- `.worktreeinclude`: padrões de arquivos ignorados pelo git (ex.: `.env`) que são copiados para o worktree novo.
- **Clone (MVP)**: `git worktree add .claude/worktrees/<slug> -b claude/<slug> <base>` + copiar `.worktreeinclude`; ao arquivar a sessão, `git worktree remove`.

### 2.8 Live artifacts (Cowork) [O]
- Sessão Electron `persist:cowork-artifact-<org>-<acct>`; nega todas as permissões; bloqueia qualquer request que não seja `cowork-artifact://` ou as 4 libs CDN na allowlist, servidas localmente de `resources/artifact-libs` (com SRI).
- `webPreferences`: `sandbox:true, contextIsolation:true, nodeIntegration:false`, preload `coworkArtifact.js`.
- A API da página é `window.cowork.callMcpTool(name,args)` (nome `mcp__<server>__<tool>`), `askClaude(...)`, `runScheduledTask(id)` (exige user activation). Links externos passam por `openExternalUrl`; os botões laterais do mouse navegam back/forward.
- Respostas com CSP fixa, `Cache-Control: no-store`, limite de 4 MB por arquivo, proteção contra symlink/TOCTOU (`O_NOFOLLOW` + checagem de inode).

### 2.9 Busca de arquivos (file-index-worker) [O]
Mensagens: `set-entries`, `stage-git-listing {cwd,repos,stageToken,gitPath}`, `commit-staged-git`, `search {query,limit}` → `{results[{relativePath,…,positions}]}`, `content-search {query,cwd,cap,pathEnv,gitPath,options}` (usa `rg` e cai para `git grep --no-index -nIz`), `list {knownVersion}` → hash sha1 para diff incremental. Walk sem git: profundidade 4, até 2000 entradas, 10 s.

### 2.10 heavy-work-worker — tarefas [O]
`gitDiff, gitDiffStats, gitWorkingTreeDiff, gitCommits, gitCommitDiff, gitDiffFileContent, gitDiffFileImage, gitDiffFilePatch, gitStatus, gitRun, gitFindBySuffix, transcriptLoad/Tail/NewestPage/Deliver/RawChain, transcriptExport, copyWorktreeFiles, carryScratchFiles, codeStats, directoryUsage, coworkArchive, dxtExtract, mcpbExtract, hashFiles…`. Suporta cancelamento (`{type:"cancel",requestId}`).

### 2.11 IPC — interfaces relevantes (preload `mainView.js`) [O]
`LocalSessions` (338 métodos/eventos), `LocalAgentModeSessions` (126), `Launch` (108), `CoworkSpaces` (34), `CoworkArtifacts` (25), `CoworkScheduledTasks` (18), `CCDScheduledTasks` (13), `ClaudeCode` (10: `getStatus, prepare, checkGitAvailable, resolveLocalSettings, patchUserSettings, setEnableWorkflows, getPeriodUsage, setLocalSandboxEnabled, setStrictSandboxMode, getLocalSandboxStatus`), `RemoteControlServing` (9), `Resources` (17), `FileSystem` (19), `MenuEvents` (21), `LocalSessionEnvironment` (6), `ClaudeVM` (16), `CcdCli` (3).
O IPC é validado por origem (`senderFrame.parent===null` e origem claude.ai/localhost/file:) e os argumentos passam por validadores de tipo. O clone deve manter esse padrão: `contextBridge` com uma API pequena e tipada, e validar tudo no main.

### 2.12 Atalhos [O]
⌘N New Session/Task · ⌘K Command Palette · ⌘B Sidebar · ⌘\\ Side Chat / Close Pane · ⌘⇧T Reopen Closed Session · ⌘O/⌘⇧O Open File/Folder · ⌘/ Keyboard Shortcuts · ⌘F/⌘G/⌘⇧G Find · ⌘W Close · ⌘, Settings.

---

## 3. Desconhecidos / não confirmado

1. **UI de Code/Cowork**: está no claude.ai remoto. Layout, componentes e fluxo visual exato não estão no ASAR. Para ver, é preciso observar o app rodando (screenshots).
2. **Formato do arquivo `filePath` da tarefa agendada**: provavelmente markdown com o prompt (não confirmado). Não confirmei a lib de cron nem a semântica do jitter.
3. **Cowork VM**: há indícios fortes (`smol-bin.arm64.img`, `vm_bundles`, `claude-code-vm`, `ClaudeVM.*`, `hostLoopMode`), mas o boot e a comunicação host↔VM não foram analisados. Para o clone, recomendo pular a VM e rodar o SDK no host com pastas restritas.
4. **Sandbox local** (`setLocalSandboxEnabled`): não confirmei se usa o sandbox nativo do Claude Code (seatbelt) ou algo do app.
5. **`localExecConsent`**: apesar do nome, NÃO é consentimento para executar shell. É o diálogo de conectores MCP diretos e de config da org (observado). Não achei diálogo nativo dedicado a "permitir comando". Os prompts de ferramenta são renderizados pela UI web via `onToolPermissionRequest`.
6. **designWindow / "omelette"**: só a bridge de PDF é local; o produto Design em si é web.
7. **Remote Control / Teleport / Dispatch**: dependem de backend Anthropic (`/v2/ccr-sessions`, device registry com assinaturas). Provavelmente inviáveis no clone.
8. Não analisei `index.chunk-DNyequwM.js` a fundo (SDK). Caso precise de flags exatas, ver a doc oficial do Agent SDK.
