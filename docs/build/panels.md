# Briefing: agente `panels`
Leia antes: `docs/build/CONVENTIONS.md`, `src/shared/contracts/workspace.ts`, `src/renderer/src/stores/ui.ts`, `docs/recon/code.md` (seções pty-host, file-index, heavy-work).

## Seus caminhos
`src/main/workspace/**` (exporte `registerWorkspace()`), `src/renderer/src/features/panels/**` (exporte `RightPanel`).

## Entregas
1. **Terminal (main)**: gerenciador node-pty: `terminal:create` spawna `$SHELL -l` (de `getShellEnv()`, `TERM=xterm-256color`, `COLORTERM=truecolor`) no cwd; `key` opcional permite reusar o pty existente (ex.: um por sessão) → `reused:true`. Dados → `emit('terminal:data')` com batching (~8ms), exit → `terminal:exit`. write/resize/kill. Mate todos no `before-quit`. Valide que o cwd existe. ATENÇÃO: node-pty é módulo nativo; o postinstall rodou `electron-builder install-app-deps` — confirme que o binário é para o Electron (se não, registre pedido em docs/requests).
2. **Git (main)**: `git:status` (porcelain v2 + `--numstat` para +/-; branch, ahead/behind; não-repo → `isRepo:false`), `git:diff` (unified patch; arquivo untracked → diff contra /dev/null via `git diff --no-index`). Use `execFile('git', …, { cwd, env: await getShellEnv(), maxBuffer })`. Timeout 10s.
3. **files:search (main)**: índice por cwd (cache com TTL ~30s): `git ls-files -co --exclude-standard` se repo, senão walk (ignora node_modules/.git/dist, profundidade 6, máx 20k). Inclua diretórios. Ranking fuzzy (fuse.js ou scorer próprio favorecendo basename/prefixo), `limit` default 20.
4. **RightPanel (renderer)**: painel redimensionável (arrastar borda esquerda, 320–900px) com abas **Terminal** / **Changes** ligadas a `useUi.rightPanel`. cwd = cwd da sessão ativa (`useUi.activeSessionId` → `api.invoke('sessions:get', id)`); sem cwd → estado vazio explicativo.
5. **Terminal UI**: xterm.js + fit + web-links, tema a partir dos tokens CSS (claro/escuro, reage a mudança de `data-theme`), fonte mono 12–13px; um pty por sessão (key = sessionId) preservado ao trocar de aba/sessão (não mate ao esconder); botão "new terminal"/kill opcional.
6. **Changes UI**: branch + ahead/behind, lista de arquivos (status colorido, +/−), clique → diff com cores (linhas +/−, números de linha, hunks), arquivos untracked incluídos; refresh: ao abrir, botão refresh, e automático quando chegar `sessions:item` com tool_use/tool_result de Edit/Write/MultiEdit/NotebookEdit/Bash da sessão ativa (debounce 500ms).
