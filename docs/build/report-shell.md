# Relatório — agente `shell`

## Feito
**Main (`src/main/app/`)**
- `windows.ts` — bounds/maximized/fullscreen persistidos em `userData/window-state.json` (debounce 400 ms + no `close`; descarta posição fora de qualquer display). `titleBarStyle: 'hidden'`, traffic lights em (16,15) p/ barra de 44px. `nativeTheme.themeSource` = `settings.theme`; `backgroundColor` por tema (atualiza em `nativeTheme.updated`). `window.open` → navegador; `will-navigate`/`will-redirect` fora do app bloqueados (http/https/mailto vão p/ navegador). Exporta `applyTheme`, `themeBackground`, `isAppUrl`, `openExternalSafe`.
- `menu.ts` — menus Claudio/File/Edit/View/Go/Window/Help com todos os atalhos do briefing (+ `Stop Response` ⌘. → `interrupt`). Itens de ação: `showMainWindow()` + `emit('menu:command', cmd)`. Help → docs do Claude Code + "Show Logs in Finder" (`log.dir()`).
- `tray.ts` — ícone template desenhado em código (asterisco 8 raios, bitmap 32px @2x). Menu: Show Claudio, New Session, Quick Entry (mostra main window), Quit. Cria/destrói conforme `menuBarEnabled`.
- `claudeCli.ts` — `claude --version` (cache) e `claude auth status --json` (via `getShellEnv`/`resolveClaudePath`). `authMethod: "claude.ai"` → `subscription`; traz `email` e `subscriptionType`.
- `notifications.ts` — assina `session:turn-finished | permission-requested | error` no bus; só notifica se a janela principal não está visível+focada; respeita `settings.notifications.*` e `notificationSound` (`silent`). Clique → `showMainWindow()` + `emit('app:navigate')`. Dock bounce em pedidos de permissão. `notify:show` respeita só o nível (não o foco).
- `index.ts` (`registerApp`) — todos os canais de `AppInvoke`, com validação zod em `settings:set`/`notify:show` e paths absolutos+existentes em `openPath`/`showItemInFolder`/`readFileAsAttachment` (imagens png/jpg/jpeg/gif/webp ≤ 5 MB → base64; resto → `{type:'file'}`). Listener de `settingsEvents` reage a tema/tray/openAtLogin e faz broadcast de `settings:changed` (cobre mudanças feitas por outros módulos, ex.: `addRecentFolder`). Quit flow: `before-quit` com `runningSessionsCount()` → "Claudio is working in N sessions. Quit anyway?".

**Renderer**
- `features/shell/AppEffects.tsx` — tema (`data-theme`, segue `prefers-color-scheme` em `system`), sync de settings, `menu:command` → trata toggle-sidebar/terminal/changes/open-settings via `useUi` **e** publica tudo em `commands`; `app:navigate` → `setActiveSession`.
- `features/shell/TitleBar.tsx` — 44px arrastável, espaço p/ traffic lights no mac, toggle sidebar, título da sessão ativa (`sessions:get` + `sessions:changed/removed`), botões Terminal/Changes/Settings com estado ativo.
- `features/settings/` — `store.ts` (zustand `useSettings`, `initSettingsSync`), `controls.tsx`, `ShortcutInput.tsx` (captura combinação → accelerator Electron; Esc cancela, Backspace desativa; exige modificador exceto F-keys), `SettingsDialog.tsx` + `tabs/{General,Models,Permissions,About}Tab.tsx`. MCP/Skills renderizam os componentes do agente mcp-quick.

## Como testar manualmente
1. `npm run dev`; redimensionar/mover/fechar e reabrir → mesma posição/tamanho.
2. ⌘, abre Settings; trocar tema (System/Light/Dark) → UI e fundo da janela mudam.
3. General → desligar "Show in menu bar" → ícone some; religar → volta.
4. Quick Entry shortcut: clicar, apertar ⌥⇧K → salva `Alt+Shift+K` (a reação ao atalho é do mcp-quick).
5. About → versão do CLI, email + plano; com `claude auth logout` mostra instrução "/login".
6. ⌘B / ⌃` / ⌘⇧D alternam sidebar/terminal/changes; demais atalhos aparecem em `commands`.
7. Com sessão rodando (quando sessions-core existir) e app em background → notificação; clique navega para a sessão. ⌘Q com sessão rodando → diálogo.
8. Clicar em link http no conteúdo → abre no navegador.

## Limitações / TODOs
- Menu é estático (rótulos não mudam por contexto; sem enable/disable por estado).
- Sem "Check for Updates", About window própria (usa painel nativo `role: about`), Find-in-page nativo (⌘F só publica `find`).
- `openAtLogin` aplicado só quando o valor muda (em dev registra o binário do Electron).
- Notificações sem ações (botões) e sem badge no Dock.
- `⌘⇧]`/`⌘⇧[` dependem de como o Electron trata Shift+colchetes em teclados não-US — validar na integração.

## Rodada 2 (após pedidos aplicados)
- `AppInfo.logsPath` agora vem do contrato; interseções removidas (`main/app/index.ts`, `AboutTab.tsx`).
- Tray: "Quick Entry" chama `showQuickEntry()` de `main/mcp/quick.ts`.
- General: hint do atalho usa `quick:shortcutStatus` (refaz a consulta quando o accelerator muda); se `registered=false` mostra aviso ("not a valid shortcut" / "already used by another app" / "not active").
- Skills: `<SkillsSettings cwd={…}/>` recebe o `cwd` da sessão ativa (via `sessions:get`).
- Teste extra: definir um atalho já usado pelo sistema (ex.: ⌘Space) → aviso amarelo em General.

## Pedidos pendentes
- Nenhum.

## Rodada 3 — bug: Esc não fechava Settings
- **Causa:** o listener era `window` em bubble phase, e o foco ficava atrás do modal. O xterm cancela o Esc (`case 27 → cancel=true` → `preventDefault()+stopPropagation()`), então o evento nunca chegava ao `window`. Os handlers do sessions-ui (`ui/Dialog`, `ui/Popover`, `Suggestions`) só param o Esc quando o overlay deles está aberto, e o `Composer` já ignora o Esc quando há `[role=dialog]`: não são a causa.
- **Correção (`SettingsDialog.tsx`):** listener em **capture phase** no `window` (roda antes do xterm/composer), com `preventDefault` + `stopPropagation` (assim o Esc não vira interrupt nem ESC no terminal) e respeitando a captura de atalho (`data-capturing-shortcut`). Ao abrir, o foco vai para o painel do dialog (`tabIndex=-1`); ao fechar, volta para o elemento anterior.
- **Teste:** abrir uma sessão, focar o terminal ou o composer, ⌘, e depois Esc → fecha; o foco volta ao terminal/composer.

## Fase 2
**Feito**
- `main/app/early.ts` (`registerEarlyApp`, antes do ready):
  - registra o protocolo `claudio` (em dev, com `execPath` + script);
  - recebe `open-url`, `open-file`, `second-instance` e argv (fora do mac) e guarda tudo numa fila até o renderer da janela principal carregar (`did-finish-load` + 400 ms);
  - rotas: `claudio://new?q=&folder=&kind=` → `app:deepLink {action:'new'}`; `claudio://session/<id>` → `{action:'open-session'}`; `.mcpb`/`.dxt` → `ext:openRequested`; `.skill` → `skills:openRequested`; pasta → `{action:'new', folder, kind:'code'}`; outros arquivos → `{action:'new', q:'@<path>'}`;
  - sanitização: aceita `~/`, exige caminho absoluto e existente, rejeita `..` e `\0`, limita tamanhos; `folder` precisa ser diretório; id de sessão segue `/^[\w-]{1,80}$/`;
  - aplica o "Reset App Data" pendente antes do Chromium abrir os arquivos.
- Ícone: `build/icon.png` (1024) e `build/icon.icns`, gerados por `build/make-icon.mjs` (Node puro + zlib, depois `sips` + `iconutil`). Em dev, `app.dock.setIcon`.
- `main/app/dock.ts`: Dock menu com New Session, New Chat e até 5 sessões recentes não arquivadas (clique → `app:navigate`). É reconstruído em `session:turn-finished` e `did-become-active`.
- `main/app/editors.ts`: detecta VS Code, Cursor, Windsurf, Zed, Xcode, Sublime, Fleet e IntelliJ em `/Applications` e `~/Applications`, com `mdfind` por bundle id como fallback (cache de 60 s). `app:openInEditor` valida o path e usa `open -a <app> <path>` (editor pedido → `preferredEditor` → primeiro encontrado → `shell.openPath`).
- `main/app/keepAwake.ts`: `powerSaveBlocker('prevent-app-suspension')` enquanto `keepAwake && runningSessionsCount() > 0` (polling de 5 s + eventos).
- Menu:
  - File: Open in Editor ⌘⇧E e Fork Session;
  - Go: Scheduled Tasks ⌘⇧S;
  - Help › Troubleshooting: Show Logs in Finder; Copy Diagnostic Info (versões e paths para o clipboard); Clear Cache and Restart (`clearCache` + `clearCodeCaches` + relaunch, com confirmação); Reset App Data… (diálogo "Keep Sessions" / "Everything" / "Cancel"; cria um marcador, reinicia e apaga `userData` no próximo boot, mantendo `sessions/` e `chat-scratch/` se escolhido; `~/.claude` nunca é tocado).
- Settings: aba **Extensions** (entre MCP e Skills) renderiza `<ExtensionsSettings/>`. General ganhou "Keep Mac awake while Claude works" e a seção Editor com "Preferred editor" (Auto + editores detectados). O zod de `settings:set` aceita `preferredEditor` e `keepAwake`.
- AppEffects: `open-scheduled-tasks` → `useUi.setView('tasks')`; `app:deepLink {open-session}` → `setActiveSession`. O `action:'new'` fica para o sessions-ui.

**Como testar**
1. `open 'claudio://new?q=hello&folder=~/dev&kind=code'` e `open 'claudio://session/<id>'` com o app aberto e com o app fechado (cold start).
2. Arrastar uma pasta ou um `.mcpb` para o ícone do Dock (no app empacotado, depois do `fileAssociations`).
3. Clique direito no Dock → sessões recentes. Settings › General → Preferred editor → ⌘⇧E numa sessão.
4. Help › Troubleshooting → Copy Diagnostic Info (colar em algum lugar); Reset App Data → "Reset, Keep Sessions" → app reinicia com settings padrão e sessões preservadas.

**Limitações**
- Em dev, o protocolo fica registrado para o binário do Electron. O `open-file` para pastas e extensões depende do `fileAssociations` (veja os pedidos).
- O Dock menu não se atualiza a cada mudança de título no meio de um turno.
- `open -a` só no macOS; em outras plataformas não há editores detectados e o path abre com o app padrão.

## Fase 2 — rodada 2 (eventos de bus)
- **Dock menu:** um mapa em memória é semeado do disco no boot e atualizado por `session:changed` e `session:removed` (rebuild com debounce de 300 ms, e só quando o top 5 ou os títulos mudam). Fallback: enquanto nenhum evento de bus chegar, relê o disco em `session:turn-finished` e `did-become-active`.
- **keepAwake (dono único: shell):** reage a `session:turn-started`, `turn-finished`, `error`, `changed`, `removed` e a mudanças de settings. Confere de novo no próximo tick, caso o evento chegue antes da contagem do sessions-core mudar. O polling caiu para 30 s e ficou só como rede de segurança.
- O pedido opcional sobre o Dock e o keep-awake em `docs/requests/shell.md` foi atendido.

## Fase 2 — bugs de integração
- **TitleBar:** com `useUi.view === 'tasks'`, mostra "Scheduled tasks" em vez do título da última sessão.
- **Sinais:** `SIGTERM` e `SIGINT` chamam `forceQuit()` (exportado de `main/app/index.ts`). Ele marca o quit como confirmado e chama `app.quit()`: sem diálogo, e as sessões param pelo fluxo normal (`before-quit`/`will-quit`). Teste: `pkill -TERM -f Claudio` fecha o app.
