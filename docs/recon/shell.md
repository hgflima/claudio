# Recon — Shell do app (main process) · Claude Desktop v2.42304.0

Fonte: ASAR extraído em `…/scratchpad/asar` (somente leitura). Quase toda a lógica do main process está em **um único chunk**: `.vite/build/index.chunk-muI2IV6k.js` (7 MB, minificado). `index.js` só faz `require` desse chunk + `index.chunk-D4B44ehk.js`; `package.json.main` aponta para `index.pre.js` (bootstrap, Sentry, flags do Chromium). Offsets `@N` abaixo são posições de caractere nesse chunk (abreviado como **M**).

Legenda: **[O]** = observado no código/strings · **[I]** = inferido.

---

## 0. Arquitetura do shell (resumo)

- **Janela principal** = `BrowserWindow` frameless (`titleBarStyle:"hidden"`, `trafficLightPosition` custom, `minWidth:600,minHeight:400`) que carrega um renderer **local** `.vite/renderer/main_window/index.html` (title bar + tela de erro de rede), com preload `mainWindow.js`. [O] M@6763022
- Dentro dela, um **`WebContentsView`** (`Oi.CLAUDE_AI_WEB`, preload `mainView.js`) carrega **claude.ai remoto** — é ali que mora a UI de chat, Settings, Code, Cowork etc. [O] M@537554, M@6771607 (`y.webContents.loadURL(e)`)
- Uma segunda `WebContentsView` (`Oi.FIND_IN_PAGE`) sobrepõe a barra de busca. [O] M@538294
- Comunicação renderer↔main: IPC **codegen** (`@ant/ipc-codegen`) — interfaces declaradas como `lo(namespace,"Nome",…,{methods,events,stores})` e implementadas via `X.for(webContents).setImplementation({...})`. Lista completa das interfaces em §2.1. [O]
- Persistência:
  - `~/Library/Application Support/Claude/claude_desktop_config.json` → `AppConfig` (`globalShortcut`, `mcpServers`, `features`, `isHardwareAccelerationDisabled`, `chromiumFlags`, **`preferences`**). [O] M@842007 (`kBe="claude_desktop_config.json"`), M@1683260 (schema `mht`)
  - Store chave-valor `yo` (electron-store-like; [I] arquivo `config.json` em userData, cf. M@536637) → `locale`, `userThemeMode`, `quickWindowPosition`, `updaterLastSeenVersion`, `updaterBannerStagedAt`, `hasTrackedInitialActivation`. [O]
  - Config gerenciada (enterprise): `/etc/claude-desktop/managed-settings.json`, GPO no Windows; [I] perfil MDM/plist no macOS. [O] M@832560

---

## 1. Tabela de funcionalidades

| ID | Funcionalidade | Comportamento para o usuário | Evidência | Compl. | MVP |
|---|---|---|---|---|---|
| SH-01 | Janela principal com title bar custom | Janela sem moldura nativa, traffic lights reposicionados, title bar desenhada localmente; conteúdo é claude.ai. Restaura posição/tamanho/maximizado entre execuções e entre monitores. | M@6763022 `OSe({…titleBarStyle:"hidden",trafficLightPosition:pPi(),minWidth:600,minHeight:400…})`; `e.placeOnDisplays()`, `e.manage(p)`; IPC `MainWindowTitleBar.updateTitleBar` | M | Must |
| SH-02 | Tela de erro de conexão | Se claude.ai não carrega: "Couldn't connect to Claude / Check your network connection", "Retrying automatically…", botões Reload e Restart Claude. Tem easter-egg "Press {key} to play" (mini-jogo). | renderer `main_window` strings; IPC `MainWindowTitleBar.showLoadError/hideLoadError/requestReloadMainView/requestRestartApp` | P | Should |
| SH-03 | Navegação Voltar/Avançar | Itens "Back"/"Forward" no menu Go + botões na title bar. | IPC `BrowserNavigation.goBack/goForward`; menu Go M@4979208 | P | Should |
| SH-04 | Quick Entry (janela rápida) | Atalho global abre painel flutuante 606×470, transparente, sempre no topo, fora do Mission Control, centrado ou na última posição (persistida por monitor). Campo "What can I help you with today?", aceita texto + imagens (paste/drag), lista de chats recentes, Esc/blur fecha. Submit: cria chat novo (ou envia ao chat escolhido) na janela principal e a traz à frente. Se a conta logada mudou entre abrir e enviar, descarta com toast. Ajusta posição para não sair da tela ("skooch"). | M@4388346 (`x4r`), `g4r=606,_4r=470`, `setAlwaysOnTop(!0,"pop-up-menu")`, `yo.set("quickWindowPosition")`, `E4r` submit, `j4r` cria chat; IPC `QuickWindow.requestDismiss/requestSkooch`, `QuickEntry.setRecentChats/onQuickEntrySubmit`; renderer `quick_window` | M | Must |
| SH-05 | Atalho global configurável | Default **`Alt+Space`**; usuário define outro accelerator; valida (precisa de modificador ou F-key), se falhar volta ao anterior e retorna erro "invalid-accelerator"/"registration-failed". Persistido em `claude_desktop_config.json → globalShortcut`. | M@832560 `mze="Alt+Space"`; M@3162134 `sI()`, `dI()`, enum `cI={QUICK_ENTRY,DICTATION,HUSHED_HERON}`; IPC `GlobalShortcut.setGlobalShortcut/getGlobalShortcut`; M@6737041 | P | Must |
| SH-06 | Quick Entry nativo (double-tap Option) | Em macOS com helper nativo, Quick Entry vira overlay nativo; atalho padrão **duplo toque em Option** (`quickEntryShortcut:"double-tap-option"` \| `"off"` \| `{accelerator}`). | Prefs default M@1471468; M@6779741 (`nativeQuickEntry?.status`), `iCr()/sCr()` "Using native Quick Entry overlay" | G | Later |
| SH-07 | Ditado por voz (Quick Entry dictation) | Atalho de ditado (`quickEntryDictationShortcut`: `capslock`/`double-tap-capslock`/`off`/accelerator; `dictationShortcut`: `default`/`off`/accelerator) alterna gravação; áudio é transcrito via stream remoto autenticado (ticket). Mensagem "Or, you can turn off Claude's dictation feature…". | M@6780035 `sUn(cI.DICTATION,()=>mCr("toggle"))`; IPC `Dictation.getStreamCredential` → `index.chunk-CFQ_HPb8.js` (POST ticketUrl → `{url,ticket,maxSeconds}`) | G | Later |
| SH-08 | Voz push-to-talk ("sableOtter") | [I] Modo de voz por segurar teclas modificadoras direitas (talk: `right-command+right-option`, card: `right-option`, dictate: `right-command`); opções de contexto de janela/apps excluídos, termos customizados. Deep link `claude://sable-otter?k=…` compõe a partir do SO. | Prefs `sableOtter*` M@1555734; enum `mlt` (fn/right-command/…); M@3264929 `case jl.SableOtter` | G | Later |
| SH-09 | Tray / ícone na barra de menus | Ícone (template image no macOS, claro/escuro no Win/Linux). Clique esquerdo abre Quick Entry (ou mostra app). Menu de contexto: **Show App**, bloco de **uso do plano** (tier, "5-hour limit", "Weekly · all models", % e "resets {when}", extra usage/credits, "Updated Xm ago", Refresh, "Usage settings…", "Tap to copy as an image"), **Quit**. Pode ser desligado (`menuBarEnabled`). | M@6798603 `V4a()` `new a.Tray`, `TrayIconTemplate.png`; `BPi()` M@5175338; `XNi()` M@5162891; IPC `Startup.isMenuBarEnabled/setMenuBarEnabled`, `PlanUsage.nudgeRefresh` | M | Should |
| SH-10 | Menu da aplicação (macOS) | Menus: **Claude** (About, Check for Updates…/estado do update, Settings… `Cmd+,`, Services, Hide/Hide Others/Show All, Quit `Cmd+Q`), **File**, **Edit**, **View**, **Go**, **Window**, **Help** + **Troubleshooting**. Itens se habilitam/rotulam conforme superfície ativa (Chat/Task/Session). | `LPi()` M@5175338 monta `[q6r(),DCi,Wxi,xPi,MCi,…,IPi,fMi]`; `W6r` M@4427284; labels §2.3 | M | Must |
| SH-11 | Atalhos de menu | Ver §2.3 (Cmd+N nova sessão, Cmd+W, Cmd+Shift+T reabrir, Cmd+K paleta, Cmd+B sidebar, Cmd+/ atalhos, Cmd+F find, zoom etc.). Muitos são roteados para o web via `MenuEvents.*`. | IPC `MenuEvents.*`; accelerators M@4959000–5175000 | M | Must |
| SH-12 | Edit commands com claim | Undo/Redo/Cut/Copy/Paste/Paste and Match Style/Delete/Select All; o renderer pode "reivindicar" os comandos de edição (ex.: editor rico) e receber `editCommand`. | IPC `MenuEvents.claimEditCommands/releaseEditCommands/editCommand/editCommandUnclaimed/reportContextMenuEditor`; M@4109624 | P | Must |
| SH-13 | Zoom | Actual Size `Cmd+0`, Zoom In `Cmd+Plus`/`Cmd+=`, Zoom Out `Cmd+-` (+ numpad). Passo 0.5 de zoomLevel, limites fator 0.25–5. Aplicado ao mainView e propagado às janelas filhas; itens desabilitam nos limites; evento `zoomFactorChanged` ao web. | M@5173806 `APi/FPi/jPi`, `mPi=.5`; M@3158649 `jHn=.25`, max 5; IPC `WindowState.getZoomFactor/zoomFactorChanged` | P | Should |
| SH-14 | Find in page | `Cmd+F` abre barra flutuante ("Find in page", Next/Previous match, fechar); `Cmd+G`/`Cmd+Shift+G`. Overlay é uma WebContentsView separada. O web pode registrar um **provider** próprio (listas virtualizadas) e receber `findRequest/findClear`, reportando `reportFindResult`. Funciona também em popouts. | `findInPage.js` + renderer `find_in_page`; IPC `FindInPage.*`, `FindInPageProvider.*`, `Resources.setFindInPageClaimed/…Overlay…`; M@538294 | M | Should |
| SH-15 | Full screen | `Ctrl+Cmd+F` alterna; HTML fullscreen do web suportado; estado exposto ao web. | M@5168843; `kPi()`; IPC `WindowState.getFullscreen/fullscreenChanged` | P | Should |
| SH-16 | Deep links `claude://` | Registra o esquema `claude` (Info.plist `CFBundleURLSchemes`). Rotas: `login/google-auth`, `claude.ai/{magic-link,sso-callback,mcp-auth-callback/…,new?q=,chat/<uuid>,project/<uuid>,settings,…}`, `code/{new?q=&folder=&file=,continue?session=,needs-input,search}`, `cowork/{new?q=&folder=&file=,shared-artifact?uuid=}`, `resume?session=` (importa sessão do CLI), `hotkey`, `sable-otter`. Traz janela à frente; links frios aguardam o mainView. Sanitiza paths (anti-traversal), descarta `q`/`prompt`/`folder` quando necessário. | M@3264929 `hR()`; enums `jl`/`Ml`; M@6774057 `app.on("open-url")`; `setAsDefaultProtocolClient` M@3242628 | M | Must (subset) |
| SH-17 | Universal links / Handoff | Abre links `https://claude.ai/...` vindos do SO (NSUserActivity BrowsingWeb, Spotlight item, `com.anthropic.claude.code.session`) dentro do app. | M@6774057 `continue-activity`, `O4a()` | M | Later |
| SH-18 | Login / autenticação | Login acontece no claude.ai dentro do WebContentsView. Para Google/SSO/OAuth, o web chama `Auth.doAuthInBrowser(url)`: no macOS usa **ASWebAuthenticationSession** (nativo), com fallback ao navegador do sistema; callback volta por `claude://login/google-auth?code=` ou `claude://claude.ai/magic-link#…`/`sso-callback`. Nonce anti-CSRF; cancelamento → toast "Sign-in was cancelled.". Cookie `_cross_domain_anonymous_id` setado no session. | IPC `Auth.doAuthInBrowser/prepareForSignedIn` M@6311107; `hXn()` (ASWebAuth); M@3264929 casos Login/MagicLink/SSOCallback | M | Must (no clone: substituir por auth do `claude` CLI) |
| SH-19 | Multi-conta / troca de conta | Shell acompanha conta ativa; Quick Entry descarta envio se conta mudou ("Your message wasn't sent because the signed-in account changed"). | IPC `Account.setAccountDetails/activeAccountChanged`; `O4r()` | M | Later |
| SH-20 | Auto-update | Squirrel.Mac com feed JSON `${base}/api/desktop/${platform}/${arch}/squirrel/update?…&channelUuid=`. Checa em tick periódico (adiado se máquina ocupada/offline); estados idle→checking→downloading→ready; menu mostra "Restart to Update to {v}"; banner no web; reinício automático após ~72 h pendente (adiado se "Claude is working"); canais `stable`/`latest`; rollback detectado; política enterprise pode desativar/limitar versão; checagem de ownership do .app. | M@4418718 `v6r()`; M@4411226 tick; M@4421605 `j6r()`; IPC `AutoUpdater.*` | M | Should |
| SH-21 | Abrir no login (startup) | Toggle "abrir ao iniciar sessão" via `setLoginItemSettings({openAtLogin,name:"Claude"})`; quando aberto no login pode iniciar oculto/background. | M@6736842; `h4a()` `wasOpenedAtLogin` M@6762789; IPC `Startup.*` | P | Should |
| SH-22 | Preferências do app | Prefs locais (schema zod, defaults em `Nat`), lidas/escritas pelo web (Settings do claude.ai) via IPC; mudanças emitem `preferencesChanged`. Principais p/ shell: `menuBarEnabled`, `quickEntryShortcut`, `dictationShortcut`, `dockBounceEnabled`, `notificationLevels{permission,idle,question}: off/badge/banner`, `notificationSound: system/none`, `keepAwakeEnabled`, `ccKeepAwakeWhileWorking`, `ccKeepAwakeOnBattery`, `sidebarMode: chat/code/task/epitaxy`. | M@1555417 `_lt`; M@1471468 defaults; IPC `AppPreferences.getPreferences/setPreference/preferencesChanged`, `AppConfig.*` | M | Must (subset) |
| SH-23 | Notificações do SO | Web pede permissão/status, mostra notificação (título, corpo, tag, `navigateTo` → clique foca janela e navega), com ações (botões) quando suportado; som configurável; níveis por tipo (permission/idle/question). Dock bounce/flash opcional quando app sem foco. | IPC `DesktopNotifications.*` M@6313240; pref `dockBounceEnabled` | M | Should |
| SH-24 | Toasts nativos do shell | Main envia toasts ao web (`showToast(message,type,opts)`) para erros (ex.: login cancelado, anexos do Quick Entry). | IPC `Toast.showToast`; `$L()` | P | Should |
| SH-25 | Tema claro/escuro | `userThemeMode` system/light/dark → `nativeTheme.themeSource`; web define via `WindowControl.setThemeMode`. Cor de fundo da janela segue o tema (`RI()`). | M@6762789 | P | Must |
| SH-26 | Idioma / i18n | Locale inicial do SO (ou salvo em `yo.locale`); web pode pedir troca (`requestLocaleChange`) → main recarrega mensagens e emite `localeChanged`. 43 arquivos de locale no bundle (en-US, pt-BR, de-DE, fr-FR, ja-JP, ko-KR, es-419, es-ES, it-IT, hi-IN, id-ID, …). en-US.json tem 837 strings (só do shell). | IPC `DesktopIntl.*` M@1679480; mapa `Jmt`; `Resources/*.json` | P | Should |
| SH-27 | Abrir arquivos/pastas pelo SO (drop no Dock, "Abrir com") | `open-file`: `.skill` → instalação de skill; `.dxt`/`.mcpb` → preview/instalação de extensão; pasta → nova sessão Code (`claude://code/new?folder=`) ou Cowork; arquivos → nova tarefa Cowork com arquivos selecionados. Também via argv em cold start. | M@6356391 `hMa()`, `vMa/xMa/bMa/SMa/CMa`; Info.plist `CFBundleDocumentTypes` (dxt, mcpb, skill, public.folder, public.data, public.text) | M | Should |
| SH-28 | Menu File: abrir arquivo/pasta | "Open File…" (`Cmd+O`), "Open Folder…" (`Cmd+Shift+O`) → dispara no web. | IPC `MenuEvents.openFile/openFolder`; M@4975347 | P | Should |
| SH-29 | Multi-janela / popouts | "New Session in New Window", popouts de sessão restauráveis entre execuções, janelas filhas de `window.open` do claude.ai gerenciadas (mesma preload `mainView.js`), janela Design separada. | IPC `MenuEvents.newWindow/closeWindow`, `SessionPopouts.*`; M@6771607 `J9.setupWindowManager`; M@4972513 design window | G | Later |
| SH-30 | Split view / painéis | View → Split View (New Session on the Right/Below, focus/move/close), Terminal, Changes, Browser, Preview, Files, Side Chat, Close Pane `Cmd+\`. (Ligado ao Code/Cowork.) | labels M@5140000–5176000; IPC `MenuEvents.splitViewCommand/toggleSessionPane`, `WindowLayout.*` | G | Later |
| SH-31 | Command palette / atalhos | `Cmd+K` Command Palette…, `Cmd+/` Keyboard Shortcuts, `Cmd+B` sidebar. | M@5169474, M@5150050, M@5169806; IPC `MenuEvents.openCommandPalette/openKeyboardShortcuts/toggleSidebar` | M | Should |
| SH-32 | Janela About | 320×388, hiddenInset, mostra versão/build, "Get Support", "Claude Help". | M@4426397; `aboutWindow.js`; IPC `AboutWindow.*` | P | Should |
| SH-33 | Help / Troubleshooting | Get Support, Claude Help, Keyboard Shortcuts; Troubleshooting: Show Logs in Finder, Copy Installation ID, Generate Diagnostic Report, Record Net Log (30s), Disable Hardware Acceleration (reinício), Clear Cache and Restart, Reset App Data…, Enable Developer Mode…, Import Claude Code CLI Sessions…, itens de Cowork VM. | labels M@5140000; IPC `DesktopInfo.showLogsInFileManager`, `DeviceStorage.clearCacheAndRestart`, `SupportBundle.submitAction` | M | Later (exceto logs) |
| SH-34 | Dock menu + Spotlight (macOS) | Menu do Dock dinâmico com entradas (sessões recentes) e itens no Spotlight, via helper nativo Swift. | M@6351493 `app.dock.setMenu(...)`, `setSpotlightEntries`; IPC `OsEntryPlaces.report` | G | Later |
| SH-35 | Keep awake | Impede sleep ocioso enquanto sessões Code trabalham (opcional na bateria). | prefs `ccKeepAwake*`; `powerSaveBlocker` (2 usos) | P | Later |
| SH-36 | Context menu / spellcheck | Menu de contexto custom em webviews (copiar/colar, abrir link externo), spellcheck. | `tzr(...)` M@4824415; `spellcheck` 9 ocorrências | M | Should |
| SH-37 | Downloads | Downloads vão p/ ~/Downloads (nome único, validado), `dock.downloadFinished`, "Show in Folder" com proteções. | M@4371920 `d2r()`; M@4388346 região `V2r()`, `s4r()` | M | Should |
| SH-38 | Links externos | `window.open`/navegação fora de claude.ai/claude.com abre no navegador padrão; navegações internas permitidas. | M@6771607 `X9(url,{trigger})`, `S4a=new Set(["claude.ai","claude.com",…])` | P | Must |
| SH-39 | Fechar janela ≠ sair | `window-all-closed` não encerra o app (fica no tray/dock); quit via menu/tray com rotina de cleanup (before-quit com interceptors). | M@6795113 `a.app.on("window-all-closed",()=>{})`; M@2999896 | P | Must |
| SH-40 | Instalar CLI (`claude` para Desktop) | Instala/desinstala CLI do app ("CcdCli"). | IPC `CcdCli.getCcdCliStatus/installCcdCli/uninstallCcdCli` | M | Later |

---

## 2. Detalhes técnicos p/ reimplementar

### 2.1 Interfaces IPC (codegen) — relevantes ao shell
Formato: `Interface: métodos/eventos`. Lista completa (94 interfaces) extraída via regex `=lo\(\w+,"(\w+)"`.

- `MainWindowTitleBar`: titleBarReady, requestReloadMainView, requestRestartApp, requestMainMenuPopup, updateTitleBar, showLoadError, hideLoadError
- `QuickWindow`: requestDismiss, requestSkooch · `QuickEntry`: setRecentChats, onQuickEntrySubmit
- `AboutWindow`: openHelp, getSupport, getAppName, getBuildProps
- `AppConfig`: getAppConfig, setAppFeature, … · `AppPreferences`: getPreferences, setPreference, preferencesChanged · `AppFeatures`: getSupportedFeatures, supportedFeaturesChanged
- `Startup`: isStartupOnLoginEnabled, setStartupOnLoginEnabled, isMenuBarEnabled, setMenuBarEnabled
- `GlobalShortcut`: setGlobalShortcut, getGlobalShortcut
- `DesktopIntl`: getInitialLocale, requestLocaleChange, localeChanged
- `WindowControl`: resize, show, focus, close, setThemeMode, setIncognitoMode, setModalScrimActive, captureScreenshot, reportFrameLayout, reportSidebar*, reportGoMenuAreas, reportCloseMenuTarget, …
- `WindowState`: getFullscreen, getVisibility, getOnScreen, getAppFocused, getZoomFactor + eventos *Changed
- `Navigation.navigate` · `BrowserNavigation`: goBack, goForward · `DeepLink.handleDeepLink`
- `MenuEvents`: claimEditCommands, releaseEditCommands, editCommand, openFile, openFolder, newWindow, closeWindow, reopenClosedSession, toggleSidebar, switchSurface, cycleSession, openCommandPalette, openKeyboardShortcuts, toggleSessionPane, closeSessionPane, findInFiles, splitViewCommand, …
- `Auth`: doAuthInBrowser(url), prepareForSignedIn · `Account`: setAccountDetails, activeAccountChanged
- `DesktopNotifications`: getAuthorizationStatus, requestAuthorization, openNotificationSettings, showNotification(title,body,tag?,navigateTo?,type?,…), supportsNotificationActions, showNotificationWithActions, notificationAction
- `Toast.showToast` · `AutoUpdater`: restartToUpdate, checkForUpdates, restartToUpdateWhenIdle, cancelPendingRestart, getRunningLocalSessionCount
- `FindInPage`: findInPage, stopFindInPage, endFindSession, stepToMatch, focusInput, blurInput, clearQuery · `FindInPageProvider`: setProviderActive, reportFindResult, findRequest, findClear
- `Dictation.getStreamCredential` · `PlanUsage.nudgeRefresh` · `DesktopInfo`: getSystemInfo, showLogsInFileManager, getDefaultBrowserName
- `FilePickers`: getDirectoryPath, getFilePath · `FileSystem`: browseFolder, browseFile(s), showInFolder, openLocalFile, readLocalFile, …
- `SessionPopouts`, `WindowLayout`, `OsEntryPlaces`, `OsOpenHandlers.ready`

> Para o Claudio: não precisa replicar o codegen; um `contextBridge` tipado com os mesmos agrupamentos basta.

### 2.2 Janelas (BrowserWindow options observadas)
| Janela | Opções-chave | Conteúdo |
|---|---|---|
| Main | frameless, `titleBarStyle:"hidden"`, `titleBarOverlay:false`, `trafficLightPosition` dinâmico (`setWindowButtonPosition`), min 600×400, `backgroundColor` do tema | `main_window/index.html` local + `WebContentsView` com claude.ai |
| Quick Entry | 606×470, `type:"panel"`, transparent, frame:false, `hiddenInMissionControl`, `skipTaskbar`, não redimensiona, `closable:false`, `alwaysOnTop("pop-up-menu")` | `quick_window/quick-window.html` |
| About | 320×388, `hiddenInset`, não redimensiona, skipTaskbar | `about_window/about.html` |
| Find overlay | `WebContentsView` sobre a main | `find_in_page/find-in-page.html` |
| Popouts | `BrowserWindow` + `WebContentsView` com o guest webContents de `window.open` | claude.ai |

### 2.3 Menu e atalhos (macOS)
- **Claude**: About Claude · Check for Updates… / Checking… / Downloading Update… / Restart to Update to {v} / Last Update Attempt Failed · Settings… `Cmd+,` · Services · Hide `Cmd+H` · Hide Others · Show All · Quit `Cmd+Q`
- **File**: New Chat/Task/Session `Cmd+N` (rótulo muda conforme superfície) · New Session in New Window · New Side Chat · Open File… `Cmd+O` · Open Folder… `Cmd+Shift+O` · Close Window/Session/Pane/Chat/Task/Page `Cmd+W` · Reopen Closed Session `Cmd+Shift+T`
- **Edit**: Undo `Cmd+Z` · Redo `Cmd+Shift+Z` · Cut/Copy/Paste · Paste and Match Style `Cmd+Shift+V` (`Cmd+Alt+Shift+V` alt) · Delete · Select All · Find ▸ Find… `Cmd+F`, Find Next `Cmd+G`, Find Previous `Cmd+Shift+G`, Find in Files…
- **View**: Actual Size `Cmd+0` · Zoom In `Cmd+Plus`/`Cmd+=` · Zoom Out `Cmd+-` · Reload · Enter/Exit Full Screen `Ctrl+Cmd+F` · Command Palette… `Cmd+K` · Show/Hide Sidebar `Cmd+B` · Split View ▸ … · Terminal/Changes/Browser/Preview/Files/Side Chat · Close Pane `Cmd+\`
- **Go**: Back · Forward · Search… · Previous/Next Chat|Task|Session (accelerators dinâmicos)
- **Window**: Minimize · Zoom · Show Main Window · Bring All to Front
- **Help**: Get Support · Claude Help · Keyboard Shortcuts `Cmd+/` · Troubleshooting ▸ …
- Dev: Show Dev Tools `Cmd+Alt+I` ([I] provavelmente só com developer mode).
- Obs: `Cmd+H` em Hide vem do `role:"hide"` padrão do Electron [I], não de accelerator explícito.
- Global: Quick Entry `Alt+Space` (default config) ou double-tap Option (nativo); `Escape` global só durante Computer Use.

### 2.4 Deep links — parsing
- Esquemas aceitos: `claude:` (prod), `claude-dev:`, `claude-nest:` etc. (`Wze`). Host = rota (`jl`), primeiro segmento do path = subrota (`Ml`).
- Política: se `authentication.disableDeepLinks` (managed), só `login` e `claude.ai/{magic-link,sso-callback}` passam.
- Navegação final via `mR(path)` = dispatch `Navigation.navigate` ao web se carregado, senão `loadURL` na mesma origem; params sensíveis (`q`, `prompt`, `folder`, `file`) são limpos da URL e reenviados por IPC.
- Cold start: URL guardada (`w4a`) até o mainView existir.

### 2.5 Auto-update — fluxo
1. Ao iniciar: aguarda config remota → `checkForUpdates` se idle.
2. Tick periódico (`B6r`); pula se offline/máquina ocupada (até um teto); respeita `autoUpdate.disabled` e `dangerousMaxVersion` (enterprise).
3. `autoUpdater.setFeedURL({url, serverType:"json"})` → Squirrel baixa → estado `ready`.
4. UI: item de menu + banner no web (`updaterBannerStagedAt`) → "Restart to Update"; `restartToUpdateWhenIdle` espera sessões locais pararem.
5. Auto-restart após ~72 h pendente (configurável remotamente), adiado enquanto "Claude is working".
- Clone: usar `electron-updater` (GitHub Releases) ou `update.electronjs.org`; não temos o feed da Anthropic.

### 2.6 Preferências — defaults relevantes ao shell
```
menuBarEnabled: true            legacyQuickEntryEnabled: true
quickEntryShortcut: "double-tap-option"   quickEntryDictationShortcut: "off"
dictationShortcut: "default"    dockBounceEnabled: false
notificationLevels: {}          notificationSound: "system"
keepAwakeEnabled: false         ccKeepAwakeWhileWorking: true   ccKeepAwakeOnBattery: true
sidebarMode: "chat"             ccPromptSuggestions: true
```
AppConfig (`claude_desktop_config.json`): `globalShortcut` (default `Alt+Space`), `isHardwareAccelerationDisabled`, `chromiumFlags[]`, `mcpServers`, `features`, `preferences`.

### 2.7 Implicações para o Claudio
- O Claude Desktop **não renderiza o chat localmente**: tudo vem de claude.ai. O Claudio vai precisar construir localmente (React) o que lá é web: Settings, chat, sidebar. As preferências acima são o "contrato" mínimo que a UI de Settings deve expor.
- Login: no Claudio, substituir SH-18 por detectar/usar a sessão do `claude` CLI (`claude /login`) — não há OAuth próprio para reimplementar.
- Itens nativos de alto custo (Quick Entry nativo, Spotlight/Dock menu, ASWebAuth, ditado) são `Later`; a versão Electron pura de Quick Entry (SH-04/05) cobre o caso principal.

---

## 3. Desconhecidos / não confirmados

1. **Single-instance lock**: `requestSingleInstanceLock` não aparece em nenhum `.js` do build (há `second-instance` só no fluxo Linux XDG). [I] No macOS o LaunchServices garante instância única; no clone, usar `requestSingleInstanceLock` mesmo assim.
2. **Arquivo do store `yo`**: inferido como `config.json` em userData (há rotina que renomeia `config.json` corrompido), não confirmado que é o mesmo store.
3. **UI de Settings**: as telas (abas, textos) vêm de claude.ai remoto — não estão no ASAR. Só vemos o schema de prefs e as IPCs; layout/rótulos das telas não confirmados.
4. **Conteúdo exato do Quick Entry**: renderer minificado; confirmados placeholder, paste, drag, imagens, setas, Esc e lista de chats recentes (via IPC). Não confirmado: seletor de modelo, anexos não-imagem, quantidade de recentes.
5. **"hushedHeron"** (`hushedHeronKey`, terceiro atalho global com `account`) e **"sableOtter"**: codinomes; função exata não confirmada (sableOtter parece voz push-to-talk).
6. **Intervalo exato do check de update** (`yJ()`, `l3r`) e **horas para auto-restart**: valores vêm de config remota (GrowthBook); 72 h é só o fallback no código.
7. **Helper nativo** (`xi()` / "claude-swift"): Quick Entry nativo, ASWebAuth, Spotlight e ditado dependem dele; o binário não foi analisado.
8. **Badge do Dock**: nenhum `setBadgeCount` encontrado; `notificationLevels` aceita `"badge"`, mas o mecanismo não foi localizado (talvez no helper nativo).
9. **Windows/Linux**: este recon focou no macOS; existem ramos para tray `.ico`, portal GlobalShortcuts (Linux/Wayland), MSIX e flashFrame, não detalhados.
