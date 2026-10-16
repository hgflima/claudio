# Relatório — agente `panels`

## Feito
**Main (`src/main/workspace/`)** — `registerWorkspace()` registra tudo.
- `terminal.ts` — node-pty: `terminal:create` spawna `$SHELL -l` com env do `getShellEnv()` + `TERM=xterm-256color`, `COLORTERM=truecolor`; valida cwd (absoluto + existe) e opts via zod; `key` reaproveita pty vivo (`reused:true`, faz resize). Saída em batch de 8 ms → `terminal:data`; exit → `terminal:exit` (sinal ⇒ 128+sig). write/resize/kill; mata todos no `before-quit`. Corrige `spawn-helper` sem +x em runtime.
- `git.ts` — `git:status`: porcelain v2 `-z --branch --untracked-files=all` + `--numstat` (staged e unstaged separados); branch, ahead/behind; untracked com contagem de linhas como `additions`; arquivo com mudança staged+unstaged aparece 2x (`staged` true/false). Não-repo → `isRepo:false`. `git:diff`: patch unificado; untracked → `git diff --no-index /dev/null <path>`. Paths relativos à **raiz do repo** (`rev-parse --show-toplevel`), mesmo se o cwd for subpasta. Bloqueia path que escapa do repo. Timeout 10 s, maxBuffer 64 MB.
- `files.ts` — `files:search`: índice por cwd com TTL 30 s (dedupe de builds concorrentes, LRU 20 cwds). Repo → `git ls-files -co --exclude-standard` (+ diretórios derivados); senão walk BFS (ignora node_modules/.git/dist/out/build/…, profundidade 6, máx 20k). Ranking próprio: prefixo do basename > substring do basename > substring do path > fuzzy no basename > fuzzy no path. Paths relativos ao **cwd**. `limit` default 20.
- `paths.ts` — `assertDir` / `assertInside`.

**Renderer (`src/renderer/src/features/panels/`)** — exporta `RightPanel`.
- `RightPanel.tsx` — painel 320–900 px, arraste na borda esquerda (largura salva em localStorage), abas Terminal/Changes ligadas a `useUi.rightPanel`, botão fechar. Sem sessão / sessão sem cwd → estado vazio explicativo.
- `terminals.ts` — registry de xterm fora do React: um terminal por sessão (key = sessionId), sobrevive a troca de aba/sessão e ao fechar o painel (não mata o pty). Buffer de dados que chegam antes do `ptyId`. Tema reage a `data-theme` via MutationObserver.
- `TerminalView.tsx` — xterm + fit + web-links, fonte mono 12.5px, tema dos tokens CSS (ANSI claro/escuro próprios), ResizeObserver → resize do pty. Toolbar: Clear, Restart. Após exit: "Press any key to restart".
- `ChangesView.tsx` + `DiffView.tsx` + `parsePatch.ts` — branch + ↑ahead ↓behind, total +/−, lista com status colorido (M/A/D/R/U), dir esmaecido, badge "staged", +/− por arquivo; clique → diff com números de linha antigos/novos, hunks, fundo verde/vermelho (trunca em 5000 linhas). Refresh: ao abrir, botão, e automático (debounce 500 ms) em `sessions:item` da sessão ativa com tool_use de Edit/Write/MultiEdit/NotebookEdit/Bash, seus tool_result, e `result`. Também escuta `git:changed` (ninguém emite ainda).

## Testado
- `npm run typecheck` e `npx electron-vite build`: limpos.
- Script Node (scratchpad, electron stubado): `git:status` em repo temporário (M + 2 untracked com +linhas), `git:diff` de untracked, `/tmp` → `isRepo:false`, path traversal bloqueado, `files:search "rpanel"` → `RightPanel.tsx` em 1º.
- node-pty dentro do Electron 44.8 (`ELECTRON_RUN_AS_NODE`): spawn de `$SHELL -l`, output e cols corretos. Binário é prebuild N-API → compatível com Electron sem rebuild.

## Como testar manualmente
1. `npm run dev`, abrir uma sessão Code com cwd num repo git.
2. Abrir Terminal (`useUi.toggleRightPanel('terminal')`): digitar `ls`, `git status`, redimensionar painel; trocar de sessão e voltar → histórico preservado. `exit` → mensagem; tecla reinicia.
3. Alternar tema claro/escuro → cores do terminal mudam.
4. Aba Changes: editar um arquivo / criar um novo → refresh → clicar → diff. Pedir ao Claude para editar algo → lista atualiza sozinha.
5. Sessão chat (sem cwd) → estado vazio.

## Limitações / TODOs
- Um terminal por sessão (sem múltiplas abas de terminal, sem escolha de shell, sem scrollback persistido em disco).
- `git:changed` (watcher de fs) não implementado — opcional no contrato.
- Diff sem syntax highlight e sem diff de imagens; arquivos binários mostram "Binary file changed".
- Contagem de linhas de untracked limitada a 200 arquivos / 2 MB cada.
- Reload do renderer reaproveita o pty (key) mas perde o scrollback visual.

## Pedidos pendentes
- `docs/requests/panels.md`: chmod do `spawn-helper` no postinstall (há contorno em runtime).
