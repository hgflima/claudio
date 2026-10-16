# Recon — Mapa via strings + nativo (Claude Desktop v2.42304.0, macOS arm64)

Fontes analisadas (somente leitura):
- `Contents/Resources/en-US.json` — **837 chaves** (IDs hash estilo FormatJS → texto em inglês), lidas todas.
- `Contents/Info.plist`
- `app.asar.unpacked/node_modules/@ant/claude-native/claude-native-binding.node` (Rust/napi-rs, 2,7 MB)
- `app.asar.unpacked/node_modules/@ant/claude-swift/build/Release/{swift_addon.node (12,6 MB), computer_use.node (1 MB)}` + wrapper `claude-swift/js/index.js` (no ASAR extraído)
- `.vite/build/buddy.js` (preload) + `renderer/buddy_window/`
- Cruzamentos pontuais no main process (`.vite/build/index.chunk-*.js`) para confirmar o que os nativos/strings significam.
- `Contents/Resources/quick-actions/` (template de macOS Service)

Legenda: **[O]** = observado diretamente; **[I]** = inferido.

> Importante: as 837 strings cobrem **só o shell local** (menus, diálogos nativos, janelas próprias, erros do main process). A UI de chat/Code/Cowork em si é claude.ai remoto (BrowserView) e tem i18n própria — não aparece aqui. Portanto este mapa é "o que o Electron local adiciona".

---

## 1. Mapa das 837 strings por feature

Contagem aproximada por grupo (strings genéricas como "Cancel" ×21, "OK" ×5, "Allow" ×4, "Not now" ×5 foram atribuídas a "Genéricos").

| Grupo | ~nº | Exemplos (ID → texto) | O que revela |
|---|---|---|---|
| **A. Menus de app / janela / edição** | ~95 | `ODySlGptaj` Settings…, `vk8ax2mb3h` Command Palette…, `ecEY91WxUG` Find in Files…, `MJmh44uBMj` Keyboard Shortcuts, `t77UbkPnXg` Reopen Closed Session, `xjOwyIuGQi` Split View, `CtFSeJn07M` Move Split View Left/Right/Up/Down, `tNl/pVLl8O` Focus Next Split View, `fEeEFfSz4K` "Zoom In (indie cooler version)" | Barra de menus completa: File/Edit/View/Window/Help, split view multi-painel, paleta de comandos, busca em arquivos |
| **B. Navegação de sessões/chats/tarefas** | ~30 | `0aHdFu/l3q` New Chat, `BgxtQ/oVxb` New Claude Code Session, `tyiWynSRix` New Task, `GpaIIAZ6mn` New Session Below, `xhaQ8bIWLL` New Session on the Right, `U//bQDu9Yk` New Session in New Window, `Ubrd2osCEK` Next Chat, `+CCvoj7koS` Next Task, `jO7VoK4TtU` New Side Chat, `Ri9DuYmnrF` Continue Last Claude Code Session | Três "modos" (Chat / Code / Task=Cowork), navegação próxima/anterior, side chat, abrir sessão em painel/janela |
| **C. Painéis toggláveis** | ~16 | Show/Hide Sidebar, Terminal, Files, Changes, Preview, Browser, Side Chat (`DNLB2o9FoA`, `98WeOhhkzv`, `VOEK8KwjgD`, `1+JBMXlHXX`, `ESzemi0CIV`, `dpcjrIOyI3`, `GeYdDBn7CI`) | Layout de IDE: sidebar, terminal (pty), árvore de arquivos, diff, preview, browser embutido, side chat |
| **D. Find in page** | 7 | `sNnRQsIEYz` Find in page, `lu0ZPQSzrk` Next match, `t0wMcoAvaD` Close find bar | Janela própria `findInPage` |
| **E. Claude Code local (sessões, pastas, trust, import)** | ~35 | `PDCixSwULY` Trust {cwd} and start a code session?, `EC/T7guN+c` Import Claude Code CLI Sessions…, `j4ih4+6F9S` Import {count} Claude Code sessions?, `blaMFi6tlP` Claude Code is running in "{folder}", `R55MmyX3xK` can't open folders on a network share, `RHad/9n4zb` Run coding task in bypass permissions mode?, `xxWzoyEmZr` explicação bypass, `st7cRCwZsY` worktrees stay inside the project, `xWitoM9oPv` Worktrees that Claude Code created… | Sessões Code locais, trust de pasta, import das sessões do CLI (`~/.claude`), modo bypass, worktrees |
| **F. Git origin pinning** | ~12 | `7g38Qb5IkG` Claude pins each repository's Git origin…, `mnYepCeDw1` merges protected files (.claude, .mcp.json…) from the new origin's default branch, `GaTWttukvr` Review Pinned Git Origins…, `/tW3eFfTK/` Re-pin this Git origin? | Proteção: arquivos de config do agente só vêm do branch padrão do origin "pinado" |
| **G. SSH remoto (Code em host remoto)** | ~35 | `SdBM+HMXgN` Confirm it's {host} to connect, `4KA3/u0ou5` {host} presents a different key, `v0wxZvIhB1` Trust new key, `XU4ou86Wwj` Enter your key's passphrase, `LSOxEaGIeD` security key PIN, `wyN59otbn9` older than OpenSSH 7.6, `ieBAXijLM8` refused the SFTP subsystem, `+RjuqI4569` Match host vs Match originalhost, `bkjga3aXPx` ~/.claude/remote/srv | Sessões Claude Code rodando via SSH em outras máquinas (codinome `chillingSloth`), com reconexão, known_hosts, 2FA, agente SSH, SFTP |
| **H. Remote Control (celular/claude.ai → este computador)** | ~40 | `+4ABv8PeZM` Let your phone and claude.ai start sessions on this computer?, `NPqkiAP6m1` Remote Control, `qSWqui3/zl` Add this folder to Remote Control?, `Y5+sLA2RJ7` Up to {limit} folders…, `hWHxcEyeKw` Pin folder, `YitqCoDYtn` Let cloud sessions run commands on this computer without asking?, `F+sdNROU5h` Session started from another device, `GP8o0KJei+` A cloud session is using "{folderName}" | Este Mac vira "host" para sessões iniciadas no celular/web, com lista de pastas permitidas, limite, pin, auto-mode |
| **I. Cowork (VM local)** | ~40 | `MJzIyvL+yT` Allow Claude to cowork in {path}?, `sUi+W9gByO` Trust {directory} and start a Cowork task?, `jOY1Gy+4Ti` requires macOS 14.0, `C/K/kK/zlp` requires virtualization, `1lmEcH0QkK` requires QEMU, `q3uYwkWXk7` vhost_vsock, `r6AwevAvuz` Free Up Cowork Disk Space…, `sxmY1kIQyH` Delete Cowork VM Bundle and Restart…, `2cplZXFjPL` Reinstall workspace, `PmPtJgqrER` Enable Cowork SDK Debugging | Agente roda numa VM Linux local (Virtualization.framework no mac, HCS/WSL no Win, QEMU/KVM no Linux); gestão de disco/bundle |
| **J. Computer use / Browser / Simulador** | ~30 | `zhKKCBKJxS` Allow Claude to control {apps}?, `Tyyzt9jcYd` Set up computer use, `HUsmsyBuuf` Screenshots are sent to Anthropic…, `DPOeWuNpqb` Let Claude work on {host} in the Browser pane?, `vKlhrSba6e` Claude can read this site, click, type and run scripts, `o6paWSepxb` Always allow sites under {parent}, `3bNwm6beps` Let Claude read your {browser} logins?, `QueJA2rQ6+` Claude will control this simulator, `LCiunPPPGP` …emulator, `17dBXAGybw` Xcode is installed, `NBhjNExpa/` Record a skill | Controle do desktop (codinome `chicago`), browser pane com permissões por host, import de logins do Chrome, iOS Simulator/Android Emulator, gravar skill por demonstração |
| **K. Permissões de ferramentas / dispositivos** | ~20 | `4QXFA+dzhZ` Allow Claude to use {toolName}?, `XOA7iEPZuB` Allow for this session, `2f4ipR1XJ3` Allow once, `z7PjA3Mv2T` Always allow, `w0OsNPP8iq` Allow Claude to use {device}?, `W7NjiggkKZ` Auto mode…using {device} without asking, `QEPTL/pTkb` Re-approve Claude's device tools? | Card de permissão (once/session/always), devices (câmera/mic/etc.) |
| **L. Extensões (DXT/MCPB) e MCP** | ~45 | `jBm3zDnv2K` Install Extension?, `H37kTzMmG0` Install Unpacked Extension…, `g4RGEh4EaI` No manifest.json found, `rCO+ULu7rr` blocked by a security blocklist, `LbOc+guZ5S` isn't signed, `uKCcuVd1Yt` Reload MCP Configuration, `ewJhC1J2qh` Open MCP Log File, `rfqC+v5aF0` entries in claude_desktop_config.json are not valid MCP server configurations, `ZGBRnVVCUF` Connect/Disconnect connector | Instalar `.dxt/.mcpb`, allowlist/blocklist org, assinatura, `claude_desktop_config.json` |
| **M. Import de "Claude (third-party)"** | ~20 | `aYW0/4J+hn` Found # MCP servers in Claude (third-party), `xnWuJqP1u6` # plugins added, `kpDWpaymNK` # skills uploaded, `X6euzX3K+c` …saved its tool on/off settings | Migração de MCP/extensões/plugins/skills de uma instalação 3P (Bedrock/Vertex) para a conta Claude |
| **N. Skills (.skill)** | ~12 | `8pHJSeFCcP` Upload this skill to Claude?, `ILCc6sMMWA` files…are sent to Claude ({host}) and saved to your personal skills, `Lw6AWRo971` Maximum size is 30 MB | Duplo-clique num `.skill` (zip) → upload para skills pessoais |
| **O. Abrir arquivos / links / artifacts** | ~25 | `W7KdSymmpX` Another app wants to open "{fileName}" in Claude, `q/+/7np9uh` This will upload the file to Claude…, `eE1aC5bLLT` This artifact wants to open {url}, `MPi1EvvGO5` Always allow {protocol} links from artifacts, `phiVFDBRbA` hides its real destination behind text before the "@", `E5rJiHAIn0` Open email link?, `AtTdluAy5o` Open phone number link? | Handler de documentos do SO, abertura segura de links vindos de artifacts (anti-phishing) |
| **P. Quick Entry / Dictation** | ~10 | `q3gBQQm1Rp` Open Quick Entry, `aZynSqBUGv` Couldn't attach a file from Quick Entry, `i6wCMcpNrS` You've used {key} to speak to Claude, but Claude needs microphone permission, `b2BK4WgyMA` turn off Claude's dictation feature…hotkey, `WtVIeOBH5a` Claude Nest…microphone | Janela flutuante de prompt rápido com hotkey + ditado por voz |
| **Q. Uso / limites (tray)** | ~25 | `RLsDPY9y1h` 5-hour limit, `AzoE5A+j8A` Weekly · all models, `JonY3R2ahu` Weekly · {product}, `v2wtV4CmvU` Extra usage · {used} of {limit}, `ppre1s1ZLA` Usage credits, `65oRnf2FWj` Usage image copied to clipboard, `jxe0H/bWVz` Tap to copy as an image, `xXQvYRLWZf` Updated {minutes}m ago, tiers Free/Pro/Max/Team/Enterprise | Menu da bandeja com medidores de uso do plano |
| **R. Hardware Buddy (BLE)** | ~30 | `2x2ParVoQo` Hardware Buddy & Maker Devices, `X4B0fhGYCv` Choose your Buddy, `bFjLlL146p` Enter the 6-digit code, `tkAZD2CTH1` Nordic UART Service…UTF-8 JSON one object per line, `mRGbzwGtHn` heartbeat snapshot…keepalive every 10 seconds, `NlhLVO18ds` one-shot event…raw SDK content array…>4KB dropped, `hzmFz+zKgD` When prompt is present, your device can return a response, `mTUIZX4Qq2` desk pet that lives off permission approvals, `rzOlorSGCr` Send to Device, Battery/Charging/Heap/Uptime/{mA}mA | Ver §4 |
| **S. Auth / contas / org** | ~20 | `DswmF5nwqi` Continue as {account}?, `CXnWhNx86V` Did your browser just confirm…, `zAhB1v/R/o` Enter this code on the GitHub page, `7Aen9JElzQ` Sign in to GitHub, `BgIqioydI3` signed in to a different organization than the one that manages this desktop, `FZpev23oTH` signed-in account changed | Login via browser (device-code), GitHub device flow, MDM de org |
| **T. Inferência 3P (Bedrock/Vertex/gateway)** | ~10 | `9GRz7bC+rr` Configure Third-Party Inference…, `VCbWmWfUKM` AWS SSO session for profile "{profile}" has expired, `Zzn0olGCin` Google Cloud credentials were rejected, `611` credential helper's token | Modo "Claude (third-party)" com AWS/GCP/API key |
| **U. Updates / instalação** | ~30 | `mRXjxhS6p4` Check for Updates…, `bd0eoKvHKg` Restart to Update to {updateVersion}, `rHVfOL8cId` Skip This Update, `7rB147Yq4f` Move to Applications folder?, `3KbALjoPbx` fix file ownership, `MjQY+YtHy1` maximum version… {maxVersion} | Squirrel/ShipIt, move-to-Applications, max/min version por org |
| **V. Troubleshooting / dev** | ~35 | `ZbNRf7GBxF` Clear Cache and Restart, `ytEQo80lWc` Reset App Data…, `Es6tilE/r4` Generate Diagnostic Report, `LShRh03tIJ` Record Net Log (30s), `P29/Q2jnYR` Disable Hardware Acceleration, `xjEv4cOudI` Enable Developer Mode…, `jpjbvS12R7` Load Local/Remote/Staging Claude.ai, `STqYpFr7p4` Show All Dev Tools, `PqLmxu2Ja/` Open App Config File, `M+KRNXNx21` Open Developer Config File | Menu Help → Troubleshooting e menu Developer |
| **W. Ciclo de vida / tray / crash** | ~20 | `QlSoWmoIH3` Claude runs in the system tray, `V9Eb08nwTF` Claude is working in {count} sessions. Quitting now will interrupt…, `/eO5H6Jz2q` Another copy of Claude is already running, `wRax1Vof8l` Claude keeps crashing, `vBHxgwQGGk` settings file was corrupted | Single-instance, confirmação ao sair com trabalho em andamento, tray |
| **X. WSL / Windows / Linux** | ~10 | `ZHjkBuqx9g` Restart WSL, `tRKAiRoyFr` Update WSL, `mm5PcGhiTW` /dev/kvm, `ZoeAQvufEY` No system keyring is available | Plataformas não-mac |
| **Y. Notificações de atenção** | ~6 | `2kVHmyDyr/` Claude needs your input to continue, `cndpJ+Ygfa` Needs Your Input, `ESsHZqNo9s` Sessions Waiting for You, `a0S8gcqLbU` Return to Claude to keep your task moving, `kdoUubpNNW` Claude is still working | Notificações quando sessão aguarda input |
| **Z. Design / Prototypes / Artifacts** | ~6 | `axu0rJHb/h` Design, `kEsl25nlp0` Prototypes, `Rml4N1fH2B` Leave Design?, `uwYSX/zxat` Artifact window | Janela "Design" (`designWindow.js`) e pop-out de artifact (`coworkArtifact.js`) |
| Genéricos (Cancel/OK/Copy/…) | ~70 | — | — |

---

## 2. Info.plist [O]

| Item | Valor | Uso |
|---|---|---|
| URL schemes | `claude://` (CFBundleURLName "Claude"); `msauth.com.anthropic.claudefordesktop` (MSAL) | Deep links; login Microsoft (Office365 MCP / Entra) |
| Deep links vistos no JS | `claude://claude.ai/new`, `claude://code/new`, `claude://code/continue`, `claude://code/needs-input`, `claude://cowork/shared-artifact`, `claude://claude.ai/mcp-auth-callback/sdk` | Novo chat, nova/continuar sessão Code, ir p/ sessão aguardando input, abrir artifact compartilhado, callback OAuth MCP |
| Document types | `.dxt`/`.mcpb` ("Desktop Extension", Viewer); `com.anthropic.skill` / `.skill` (Owner); `public.folder` (Editor); `public.data` (All Files); text, pdf, docx, doc, rtf, odt, epub, png, jpg, gif, webp (Alternate) | Abrir com Claude / arrastar para o ícone |
| UTI exportado | `com.anthropic.skill` (conforms `public.zip-archive`, ext `.skill`) | Pacote de skill |
| UTI importado | `net.daringfireball.markdown` (`.md`, `.markdown`) | — |
| LSMinimumSystemVersion | 13.0 (Cowork exige 14.0) | — |
| ATS | `NSAllowsArbitraryLoads=false`, `NSAllowsLocalNetworking=true` | dev servers locais no preview |
| Permissões (TCC) | Microphone (ditado), SpeechRecognition (ditado), AudioCapture, Camera, Location (conteúdo que o usuário permitir), Bluetooth (hardware buddy), Desktop/Downloads/Documents ("scheduled tasks, live artifacts e outros arquivos Cowork" em Documents), AppleEvents ("comandos podem controlar outros apps"), LocalNetwork | — |

Também: `Resources/quick-actions/{Info.plist,document.wflow}` = template de **macOS Service** (Automator "Run Shell Script" com placeholders `__TITLE__`, `__SEND_TYPES__`) instalado em runtime por `osEntryPoints.refreshServices()` [O] → entradas no menu Services/Finder Quick Actions tipo "Send to Claude" [I pelo string `7lbL0sw724` "Send to Claude"].

---

## 3. Módulos nativos

### 3.1 `@ant/claude-native` (Rust, napi-rs, multi-plataforma) [O: nomes de funções registradas]

| Área | Funções exportadas | Para que serve [I] |
|---|---|---|
| Janelas/foco (mac+win) | `focusWindow`, `getWindowAbove`, `moveWindowBehind`, `getActiveWindowHandle`, `getFrontmostAppInfo` (appName, appIconBase64), `isOtherAppFullscreen` | Quick Entry / overlays sabendo qual app está na frente; não roubar foco em fullscreen |
| Input sintético | `moveMouse`, `mouseButton`, `mouseScroll`, teclas (tabela de keycodes F1–F20, mídia, Numpad), "enter the text", `doubleClickInterval`, `pressedMouseButtons` | Base de computer use (biblioteca tipo `enigo`) |
| Acessibilidade | AXFocusedWindow, AXSheets, `cuSavePanelProbe*`, `cuSaveSheetFolderAndParents` | Computer use lidando com diálogos Save/Open |
| Office (Win) | `closeOfficeDocument`, `focusOfficeDocument` | Integração com Word/Excel (add-ins?) |
| Processos | `isProcessRunning`, `readProcessTree`, `readProcessFootprints`, `readProcessCreationTime`, `getProcessLineage`, `prefetchProcessPrivateMemory`, `readOwnMemoryComposition`, `readConsoleClients`, `listTcpListeners` | Monitorar processos filhos (MCP/CLI), detectar dev servers ouvindo portas (preview) |
| Arquivos seguros | `openBeneath`, `mkdirBeneath`, `renameBeneath`, `rmdirBeneath`, `openRootDir`, `cloneAt`, `materializeDatalessFile` | Acesso a pasta confinado (anti path-traversal), clonefile APFS, arquivos iCloud "dataless" |
| Plist/registro | `readPlistValue`, `parsePlistValue`, `readRegistryValues`, `write*Registry*`, `enumRegistry*`, `readUserPathValueRaw`, `readFreshUserPath` | Ler MDM/config gerenciada; PATH do usuário |
| Chaves de hardware | `hardwareKeyGetOrCreate`, `hardwareKeySign` (Secure Enclave, tag `com.anthropic.claude.hwkey`), `userDpapiProtect/Unprotect` (Win) | Chave de dispositivo atestada (Remote Control/identidade do device) |
| Sessão mac | `readMacSessionState` (screenLocked, onConsole, loginDone, protectedDataAvailable), `attestedMachRequest`, `ASWebAuthenticationSession` (AuthRequest) | Saber se tela bloqueada; login OAuth nativo |
| Windows/VM | `getHcsStatus`, `enableWindowsOptionalFeature`, `startWindowsService`, `queryWindowsServiceState`, `getWindowsElevationType`, `enumerateNetworkDrives`, `getCurrentPackageFamilyName` | Cowork no Windows (HCS), MSIX |
| Imagem | `encodeFrameJpeg` | Screenshots/frames do simulador |
| VM | `applyVmImageDelta` | Update incremental do bundle da VM Cowork |
| Ícones | `getAppInfoForFileAsync` | "Abrir com…" mostrando app padrão |

### 3.2 `@ant/claude-swift` → `swift_addon.node` (macOS) [O: wrapper JS lista os grupos]

Grupos expostos (lazy-loaded): `quickAccess, notifications, desktop, api, midnightOwl, vm, permissionFixer, tearOffHalo, sessionHalo, slackWatch, wakeScheduler, updater, keychain, trayUsage, watchRecorder, memoryPressure, osEntryPoints, simulatorView` + `nativeGroup("sableOtter")` + `computerUse` (de `computer_use.node`). Todos os eventos saem por um único `events.setListener` → `EventEmitter`.

| Grupo | Métodos/eventos observados | Feature |
|---|---|---|
| `quickAccess.overlay` / `.dictation` | `overlay.setLoggedIn`, `setRecentChats`; `dictation.setLanguage`, `setAwaitFinalTranscript`; eventos `quickEntryShortcut`, `quickEntryDictationShortcut`, `quickEntrySubmitted`; strings `dictate/holdDictate/optionDoubleTapped/doublePressTimeThreshold/claudeAiSpeechSession/dictationBaseURL/interimTranscription` | **Quick Entry nativo** (overlay SwiftUI, padrão = duplo toque em Option) + **ditado** com transcrição streaming via servidor claude.ai (cookie de sessão) |
| `notifications` | `show, close, requestAuth, getAuthStatus, registerCategory, openSettings`; evento `notificationInteraction` | UNUserNotificationCenter com ações |
| `desktop` | `captureScreenshot`, `getOpenWindows` | Anexar screenshot/janela ao chat |
| `vm` | `isVirtualizationSupported`, `classify`, `currentWarmName`, `isRunning`, `isGuestConnected`, `vmAddApprovedOauthToken`, `vmDeleteSessionDirs`, `vmGetSessionsDiskInfo`, `vmPruneSessionCaches`, `vmShow/HideDebugWindow`, `vmRunEdrExtensionJson`; eventos `vmStartupStep`, `vmStopped`, `guestConnectionChanged`, `apiReachability`, `networkStatus`, `kernelConsoleData` | **Cowork VM** (Virtualization.framework + rede userspace — o binário embute gVisor netstack em Go [I: strings `connTrackTable`, `nftables`, TCP SACK]) |
| `permissionFixer.run` | — | "Fix ownership" p/ auto-update (pede Touch ID/senha) |
| `tearOffHalo` | `begin, setArmed, end` | Feedback visual ao arrastar painel/aba para fora (tear-off em nova janela) [I] |
| `sessionHalo` | (sem uso visto) | Halo de sessão [desconhecido] |
| `slackWatch` | (sem uso visto) | [desconhecido; nome sugere observar Slack] |
| `wakeScheduler` | `status`, eventos `lifecycleChanged`; settings `wakeSchedulerEnabled` | Acordar o Mac para rodar tarefas agendadas/Remote Control |
| `updater` | `getShipItJobInfo`, `removeShipItJob` | Squirrel ShipIt |
| `keychain` | — | Segredos |
| `trayUsage.popUp` | evento `trayUsageAction` | Menu nativo de uso na barra de menus (copiar como imagem) |
| `watchRecorder` | eventos `watchRecordInput`, `watchRecordMicState`, `watchRecordNarration` | Gravar demonstração do usuário (tela+mic+narração) → "Record a skill" / teach mode |
| `memoryPressure.subscribe` | — | Reagir a pressão de memória |
| `osEntryPoints.refreshServices` | — | Instalar macOS Services (ver §2) e Spotlight (`CoreSpotlight`, `clearSpotlight`) [I] |
| `simulatorView` | `mount/unmount/setBounds/setVisible/setOrientation/setBend/goFold/followFold/confirmFold/still`; eventos `hingeAngle`, `fold`, `poseChange` | Visão nativa do **iOS Simulator** embutida (inclui dobráveis) |
| `midnightOwl.setEnabled` | dev flag "Enables midnightOwl prototype" | Protótipo [desconhecido] |
| `sableOtter` (= **Quick Write**) | eventos `compose, hold, kept, openInClaude, openSettings, outcome, transformRequested, typeRequested, windowChoice` | Ver §5 |

### 3.3 `computer_use.node` [O]
Funções: `checkAccessibility`, `checkScreenRecording`, `captureWindow/Region/Excluding` (ScreenCaptureKit), `listWindows`, `appScoped*` (controle por app: `appScopedCaptureWindow`, `appScopedShowCover`, `appScopedZoomWindow`, `appScopedWaitUntilWebTreeIsReady`), `chicagoListInstalled(WithRunning)`, `chicagoPrepareDisplay`, `performSpotlightQuery`, `hidePhantomCursor`, `armFocusStealGuard`, menus (`menuBar`, `popupMenu`, `menuItemNotFound`), caret/text (`caretIndex`, `notTextEditable`). → **Computer use** com modo "app-scoped" (Claude controla só apps aprovados, `chicagoUserDeniedBundleIds`).

---

## 4. O que é "Buddy" [O + I]

**Hardware Buddy & Maker Devices** — API **BLE** (Bluetooth Low Energy) para dispositivos físicos que mostram/aprovam o que o Claude está fazendo. Exemplo oficial: um "desk pet" (bichinho de mesa) que "vive" de aprovações de permissão (repo `claude-desktop-buddy`).

- Disponível **só em developer mode** ("not an officially supported product feature", `zTrDHxC7yZ`); setting `hardwareBuddyEnabled`.
- Janela própria `buddy_window/buddy.html`; preload `buddy.js` expõe `window["claude.buddy"].Buddy`:
  `status, deviceStatus, setName, pairDevice, scanDevices, pickDevice, cancelScan, submitPin, forgetDevice, pickFolder, preview, install, onProgress, onPairingPrompt` (IPC `$eipc_message$_…_$_claude.buddy_$_Buddy_$_<método>`).
- Transporte: **Web Bluetooth no renderer** (`mainView.js`, `BuddyBleTransport_$_tx/log/reportState`) usando **Nordic UART Service** `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (TX `…0002`, RX `…0003`); dispositivo anuncia nome começando com `Claude`.
- Protocolo: JSON UTF-8, um objeto por linha (`\n`). Desktop envia **heartbeat snapshot** a cada mudança + keepalive a cada 10 s; a cada turno completo, evento one-shot com o array de conteúdo bruto do SDK (descartado se >4 KB). Se o objeto tiver `prompt`, o device pode responder (aprovar/negar permissão).
- Pareamento com código de 6 dígitos (`bFjLlL146p`); indica "Connected · Encrypted" vs "unencrypted".
- "Send to Device"/`pickFolder`/`install` = enviar uma pasta (character pack) ao device. Telemetria do device exibida: Battery, Charging, {mA}mA, Heap, Uptime, Level, Velocity.

Para o clone: **Later** (nicho, dev-mode).

---

## 5. Codinomes → feature (mapa de flags) [O nomes; I significado]

Mapa de feature flags (`index.chunk-muI2IV6k.js`, objeto `{artifactsPane, nativeQuickEntry, …}`), settings e dev settings:

| Codinome | Significado (evidência) |
|---|---|
| `sableOtter` | **Quick Write**: system prompt "You work at the text cursor of another app…"; envia texto selecionado, clipboard (texto/imagem), texto da janela, "App class", termos do usuário e `conversation_preferences`; responde via tool `result {status: write\|answer\|cannot_apply}`; header `anthropic-client-feature: quick_write`; modelo default `claude-sonnet-5`, timeout 15 s. Settings: `sableOtterTalkHold/CardHold/DictateHold`, `sableOtterWindowContext` ("ask"), `sableOtterExcludedApps`, `sableOtterTerms` (≤200). |
| `chicago` | Computer use (`chicagoEnabled`, teach mode, watch record, batch-only) |
| `chillingSloth*` | Code via SSH (shell, worktree remoto, PuTTY key, preview remoto, enterprise, local) |
| `yukonSilver` | Suporte à VM Cowork ("lam_feature_support_evaluated", feature yukonSilver) |
| `louderPenguin`/`quietPenguin` | Variações no envio de mensagens Cowork/arquivos conectados [I fraco] |
| `epitaxy` | Modo de sidebar "epitaxy"/"code" + preferências de editor externo (VSCode, Cursor, Windsurf, Zed) → "Open in editor" |
| `grandPrix` | "agentic-mode" com grants por sessão [I] |
| `violinBow` | Prompts/home settings dentro da sessão Code [desconhecido] |
| `humbleSky` | Rotinas do host (`hostRoutinesAvailable`) |
| `hushedHeronKey` | Atalho global configurável por conta [desconhecido] |
| `rubberDuck`, `velvetFinch`, `midnightOwl`, `coworkKappa`, `coworkCopperHeron`, `copperLark*`, `telescopeBridge` | Não confirmados |

Outras flags com nome autoexplicativo: `artifactsPane, nativeQuickEntry, quickEntryDictation, customQuickEntryDictationShortcut, quickEntryGlobalShortcut, trayIcon, folderWorktrees(Remote), wakeScheduler, keepAwake, codeSessionKeepAwake, ccdPromptSuggestionsSetting, ccdPlugins, computerUse(AppScoped/PerAppAccess), coworkWatchRecord, coworkArtifacts, iosSimulator, androidEmulator, simulatorScreenshotEditor, simulatorMiniView, chromeExtensionInstall, ccdGitEngine, sessionPrOwnership, coworkArtifactPopout, popoutZoom, claudeDesignWindow, chatTab, selfHostedSessions, selfHostedCowork, desktopHome, chatCodeExecution, coworkBranchSession, coworkScheduledTaskProjects, sshAttachmentTransport, wsl*, sessionMentions, inlinePastes, sideSessions, btwChildSessions, ccdConnectorTools, ccdTeleportSnapshot, coworkBrowser, multiAccount, mcpFinishInApp`.

Dev settings (`developer_settings.json`): `isDxtEnabled`, `isDxtDirectoryEnabled`, `isLocalDevMcpEnabled`, `isUvSystemPythonEnabled`, `isMidnightOwlEnabled`, `isDictationAwaitFinalTranscriptEnabled`, `isChicagoEnabled`, `isChicagoBatchOnly`.

---

## 6. Tabela de funcionalidades

| ID | Funcionalidade | Descrição do comportamento para o usuário | Evidência | Compl. | MVP |
|---|---|---|---|---|---|
| S01 | Barra de menus nativa completa | File/Edit/View/Window/Help com New Chat/Session/Task, zoom, fullscreen, spelling, Services | strings `0aHdFu/l3q`, `Z9g5m/V9Nq`, `m3wVzL5scw`; accelerators `CmdOrCtrl+N/K/B/,/\\/Shift+T/Shift+O/G` | P | Must |
| S02 | Três modos: Chat / Code / Task (Cowork) | Abas/atalhos para novo chat, nova sessão Code, nova tarefa | `sNotLv3TK+` Code, `tyiWynSRix` New Task, `S9rMbKFol0` Task | M | Must (Chat+Code) |
| S03 | Navegação entre sessões | Próxima/anterior, reabrir fechada, continuar última sessão Code | `ibf3kUb02G`, `t77UbkPnXg` (Cmd+Shift+T), `Ri9DuYmnrF` | P | Must |
| S04 | Split view / multi-painel | Nova sessão à direita/abaixo/nova janela; mover e focar painéis | `xhaQ8bIWLL`, `GpaIIAZ6mn`, `CtFSeJn07M`, `tNl/pVLl8O` | G | Should |
| S05 | Painéis laterais de IDE | Toggle Sidebar, Terminal, Files, Changes (diff), Preview, Browser, Side Chat | `DNLB2o9FoA`…`GeYdDBn7CI`; node-pty unpacked | G | Must (Sidebar, Terminal, Changes); Should (resto) |
| S06 | Command Palette + Find in Files + Find in page | Paleta de comandos; busca em arquivos do projeto; barra de busca na página | `vk8ax2mb3h`, `ecEY91WxUG`, `sNnRQsIEYz`; `findInPage.js` | M | Should |
| S07 | Side Chat | Chat lateral paralelo à sessão principal | `jO7VoK4TtU`, `WNFNIXqDwo`; flag `sideSessions`, `btwChildSessions` | M | Later |
| S08 | Sessões Claude Code locais com trust de pasta | Escolher pasta → diálogo "Trust {cwd}"; bloqueia home, raiz de disco, rede/UNC, pastas do próprio Claude | `PDCixSwULY`, `TrYRcboKjW`, `R55MmyX3xK`, `KWzjrR1ceN` | M | Must |
| S09 | Import de sessões do Claude Code CLI | Menu "Import Claude Code CLI Sessions…" importa transcripts do terminal; pula rodando/já importadas | `EC/T7guN+c`, `j4ih4+6F9S`, `Qr3R8M8OLy` | M | Should |
| S10 | Modos de permissão (incl. bypass/auto) | Confirmação explícita para bypass; aviso de prompt injection | `RHad/9n4zb`, `xxWzoyEmZr`, `W7NjiggkKZ` | P | Must |
| S11 | Card de permissão de ferramenta | Allow once / for this session / Always allow / Don't allow | `4QXFA+dzhZ`, `2f4ipR1XJ3`, `XOA7iEPZuB`, `z7PjA3Mv2T` | M | Must |
| S12 | Worktrees por sessão | Sessões Code em git worktrees; prefixo de branch `claude`, até 3 warm, limpeza após 24 h; auto-arquivar ao fechar PR | settings `ccBranchPrefix`, `ccMaxWarmWorktrees:3`, `ccWorktreeReapAfterHours:24`, `ccAutoArchiveOnPrClose` | G | Should |
| S13 | Git origin pinning | Fixa origin do repo; arquivos protegidos (.claude, .mcp.json) só do branch padrão; revisar/re-pin | `7g38Qb5IkG`, `mnYepCeDw1`, `GaTWttukvr` | M | Later |
| S14 | Code via SSH | Rodar sessões em hosts SSH; verificação de host key, passphrase, PIN de security key, 2FA, reconexão automática, diagnósticos detalhados | ~35 strings grupo G; flags `chillingSloth*` | G | Later |
| S15 | Remote Control | Permitir que celular/claude.ai iniciem sessões neste computador em pastas listadas (limite N, pin); auto-mode opcional; desliga ao deslogar | grupo H; settings `remoteControl*` | G | Later |
| S16 | Cowork (agente em VM local) | Tarefas em VM Linux isolada com pasta montada; checagens de SO/virtualização; limpeza de disco, reset de bundle/sessões, debug | grupo I; `swift_addon vm*`; `smol-bin.arm64.img` | G | Later |
| S17 | Tarefas agendadas + wake scheduler | Tarefas Cowork/Code agendadas; acordar o Mac para executá-las; keep-awake enquanto trabalha (opção na bateria) | settings `coworkScheduledTasksEnabled`, `ccdScheduledTasksEnabled`, `wakeSchedulerEnabled`, `ccKeepAwakeWhileWorking`; `NSDocumentsFolderUsageDescription` | M | Should (keep-awake); Later (wake) |
| S18 | Computer use | Claude controla apps aprovados (por app), screenshots enviados à Anthropic; setup de Accessibility/Screen Recording | grupo J; `computer_use.node` | G | Later |
| S19 | Browser pane com permissões por host | Browser embutido; "Let Claude work on {host}?"; allow por domínio/porta para dev servers; alerta de nomes .local | `DPOeWuNpqb`, `vKlhrSba6e`, `o6paWSepxb`, `iNs8MbHlPX`; settings `launchPreview*` | G | Should (preview de dev server) |
| S20 | Import de logins do Chrome / extensão Chrome | Ler logins do Chrome para o browser do Cowork; extensão "Claude in Chrome" | `3bNwm6beps`, `PbhDLsWQf4`, `1BYhB06oNf`, `yNExH0dp3+` | G | Later |
| S21 | iOS Simulator / Android Emulator embutidos | Controle e visão nativa do simulador; requer Xcode | `QueJA2rQ6+`, `LCiunPPPGP`, `17dBXAGybw`; `simulatorView` | G | Later |
| S22 | Gravar skill por demonstração | "Record a skill": grava tela+mic+narração | `NBhjNExpa/`; `watchRecorder`; `watchRecordChooser.js`, `computerUseWatchRecord.js` | G | Later |
| S23 | Extensões desktop (.dxt/.mcpb) | Duplo-clique/arrastar instala; preview; diretório; unpacked em dev mode; blocklist/allowlist/assinatura por org; update de extensão da org | grupo L; Info.plist doc types | G | Should |
| S24 | MCP via `claude_desktop_config.json` | Servidores MCP locais; Reload MCP Configuration; abrir log MCP; erros de parse | `uKCcuVd1Yt`, `ewJhC1J2qh`, `rfqC+v5aF0`, `rwFEudHXey` | M | Must |
| S25 | Skills (.skill) | Abrir `.skill` → "Upload this skill to Claude?" (≤30 MB) → skills pessoais | grupo N; UTI `com.anthropic.skill` | P | Should |
| S26 | Import de config 3P | Migrar MCP/extensões/plugins/skills de "Claude (third-party)" | grupo M | M | Later |
| S27 | Abrir arquivos no Claude | Outro app/Finder abre arquivo(s) → confirma upload ao chat | `W7KdSymmpX`, `sD7YanpzLD`, `q/+/7np9uh`; doc types | P | Should |
| S28 | Links seguros de artifacts | Confirmação para http/mailto/tel/protocolos; detecção de `user@host` enganoso; "always allow" por protocolo | grupo O | P | Should |
| S29 | Quick Entry | Janela flutuante global (padrão duplo-toque Option) com chats recentes; anexos | `q3gBQQm1Rp`; settings `quickEntryShortcut:"double-tap-option"`; `quickWindow.js` | M | Should |
| S30 | Ditado por voz | Hotkey (fn, right-cmd, right-opt…) para falar; transcrição streaming; aviso de permissão de mic | `i6wCMcpNrS`, `b2BK4WgyMA`; enum `fn,right-command,right-option,right-control,right-shift,…`; `quickAccess.dictation` | G | Later |
| S31 | Quick Write (sableOtter) | Escrever/transformar texto no cursor de qualquer app via voz/teclado; usa seleção, clipboard e janela | chunk `CMleMrG7` (`runCursorRequest`) | G | Later |
| S32 | Uso do plano na bandeja | Limite 5h, semanal (todos/por produto), créditos extras; "copiar como imagem"; atualizado há X min | grupo Q; `trayUsage.popUp` | M | Should |
| S33 | Tray / roda em background | Ícone na bandeja/menu bar; fechar janela não encerra (Win/Linux); confirmar ao sair com sessões ativas | `QlSoWmoIH3`, `V9Eb08nwTF`; Tray icons | P | Must |
| S34 | Notificações de atenção | Notifica quando sessão precisa de input/ficou ociosa/pergunta; níveis off/badge/banner por tipo; som; bounce do Dock | `2kVHmyDyr/`, `ESsHZqNo9s`; settings `notificationLevels{permission,idle,question}`, `notificationSound`, `dockBounceEnabled` | M | Must |
| S35 | Sugestões de próximo prompt | Sugere próximo prompt após cada resposta (1 request extra) | setting `ccPromptSuggestions` | P | Should |
| S36 | Auto-update | Checar, baixar, "Restart to Update", pular versão; fix ownership; move to Applications; versão min/max por org | grupo U | M | Should |
| S37 | Troubleshooting | Limpar cache, reset app data, relatório diagnóstico, net log 30s, desativar aceleração de hardware, logs | grupo V | P | Should |
| S38 | Developer mode | Dev tools, carregar claude.ai local/staging, config files, flags de dev | `xjEv4cOudI`, `jpjbvS12R7`, `M+KRNXNx21` | P | Should |
| S39 | Login / org / GitHub | Login via browser com confirmação; GitHub device code; MDM força org | grupo S | M | Must (login); Should (GitHub) |
| S40 | Inferência 3P | Configurar Bedrock/Vertex/API key/credential helper | grupo T | M | Later |
| S41 | Hardware Buddy (BLE) | Parear dispositivo maker por BLE para mostrar status e aprovar permissões | §4 | G | Later |
| S42 | Janela Design / Prototypes | Janela separada "Design" | `axu0rJHb/h`, `kEsl25nlp0`; `designWindow.js` | G | Later |
| S43 | Pop-out de artifact | Abrir artifact em janela própria | `uwYSX/zxat`; `coworkArtifact.js` | M | Later |
| S44 | macOS Services / Spotlight | Entradas no menu Services ("Send to Claude") | `quick-actions/`; `osEntryPoints.refreshServices` | P | Later |
| S45 | Open in editor externo | Abrir projeto em VSCode/Cursor/Windsurf/Zed | `epitaxyPrefs` + lista de editores | P | Should |
| S46 | Single-instance + crash recovery | "Another copy…already running"; desliga GPU após crashes repetidos; reset de settings corrompidos | `/eO5H6Jz2q`, `DWl3T8ZbrA`, `vBHxgwQGGk` | P | Must |
| S47 | i18n do shell | ~40 locales; troca de idioma via `DesktopIntl` | `*.json` em Resources; `claude.hybrid.DesktopIntl` | M | Later |

---

## 7. Lista consolidada de TODAS as features de alto nível detectadas

**Núcleo**
1. Chat (claude.ai remoto) + aba Chat
2. Claude Code local (sessões, trust de pasta, modos de permissão incl. bypass/auto)
3. Cowork / Tasks (agente em VM local, pasta montada)
4. Layout de IDE: sidebar, terminal (pty), árvore de arquivos, diff/changes, preview, browser pane, side chat
5. Split view multi-painel + pop-out de janelas (tear-off)
6. Command palette, find in files, find in page, atalhos de teclado

**Integrações/extensibilidade**
7. MCP local via `claude_desktop_config.json` (reload, logs)
8. Extensões desktop `.dxt/.mcpb` (diretório, unpacked, assinatura, políticas org)
9. Plugins (Customize › Plugins, marketplace) e Skills (`.skill`, Customize › Skills)
10. Import de sessões do CLI e de configuração "Claude (third-party)"
11. Conectores (connect/disconnect) e OAuth callback MCP
12. Extensão Claude in Chrome + import de logins do navegador
13. Open in editor externo (VSCode/Cursor/Windsurf/Zed)
14. GitHub sign-in (device flow), PR ownership, auto-arquivar ao fechar PR

**Agente avançado**
15. Computer use (app-scoped, teach mode, batch-only)
16. iOS Simulator / Android Emulator embutidos
17. Gravar skill por demonstração (watch record)
18. Preview de dev servers com políticas por host/porta/rede local
19. Worktrees por sessão + git origin pinning
20. Code via SSH em hosts remotos (+ WSL no Windows)
21. Remote Control (celular/claude.ai → este computador)
22. Tarefas agendadas, wake scheduler, keep-awake
23. Sugestões de próximo prompt

**Entrada rápida / SO**
24. Quick Entry global (overlay nativo)
25. Ditado por voz (hotkey configurável)
26. Quick Write (escrever no cursor de qualquer app)
27. macOS Services, document handlers ("Abrir com Claude"), deep links `claude://`
28. Screenshots / captura de janela para anexar
29. Notificações nativas com níveis, som, bounce do Dock
30. Tray / menu bar com medidor de uso do plano

**Plataforma/ops**
31. Auto-update (ShipIt), move to Applications, fix ownership
32. Troubleshooting (cache, reset, diagnóstico, net log, GPU)
33. Developer mode (dev tools, ambientes local/staging, flags)
34. Login, multi-conta, MDM de org (versão min/max, pastas permitidas, políticas)
35. Inferência 3P (Bedrock/Vertex/gateway)
36. Abertura segura de links de artifacts
37. Janela Design/Prototypes; pop-out de artifact
38. Hardware Buddy (BLE, dev-mode)
39. i18n (~40 locales)

---

## 8. Detalhes técnicos úteis p/ reimplementar

- **Padrão de IPC** [O]: canais `$eipc_message$_<uuid>_$_<namespace>_$_<Interface>_$_<método>`; preload expõe `window["<namespace>"].<Interface>` só quando frame é top-level e origin ∈ {claude.ai, preview.claude.ai, claude.com, localhost, *.ant.dev, file:, app://localhost}. Ex.: `claude.buddy.Buddy`, `claude.hybrid.DesktopIntl` (`getInitialLocale`, `requestLocaleChange`, `onLocaleChanged`). Para o clone: um preload por janela + `contextBridge` tipado.
- **Atalhos padrão vistos** [O]: `CmdOrCtrl+N` (novo), `+K` (paleta [I]), `+B` (sidebar [I]), `+\` (split [I]), `+,` (settings), `+Shift+T` (reabrir sessão), `+Shift+O`, `+Shift+G`, `+G`/`+F` (find), `+/`, `Ctrl+Cmd+F` (fullscreen), zoom `+=/-/0`, `CommandOrControl+Alt+I` (devtools). Quick Entry: `double-tap-option`; ditado: `fn` / modificadores direitos.
- **Settings relevantes** (defaults [O]): `notificationLevels {permission, idle, question}` ∈ off/badge/banner; `notificationSound:"system"`; `keepAwakeEnabled:false`; `ccKeepAwakeWhileWorking:true`; `ccKeepAwakeOnBattery:true`; `ccPromptSuggestions:true`; `ccBranchPrefix:"claude"`; `ccMaxWarmWorktrees:3`; `ccWorktreeReapAfterHours:24`; `secureVmFeaturesEnabled:true`; `sidebarMode` (inclui "code"/"epitaxy"); `vmMemoryGB`, `vmCpuCount`; `bypassPermissionsModeEnabled`.
- **Arquivos de config**: `claude_desktop_config.json` (MCP), `developer_settings.json` (flags dev), "App Config File", pasta de extensões e de settings de extensão; logs `main.log` + logs Swift na mesma pasta; `~/.claude/remote/srv` em hosts SSH.
- **Quick Write** (se for implementar): uma chamada `messages.create` com tool única `result{status,text,reason}`, contexto em tags com sufixo aleatório (`<source-xxxx>`, `<clipboard-xxxx>`, `<window-xxxx>`, `<terms-xxxx>`, `<preferences-xxxx>`, `<request-xxxx>`) — boa prática anti-injection reaproveitável.
- **Buddy BLE**: Nordic UART UUIDs acima; JSON por linha; heartbeat+keepalive 10s.
- **No clone (Electron puro)** os nativos mapeiam para: `node-pty` (terminal), `globalShortcut` + `BrowserWindow` frameless (Quick Entry; duplo-toque Option exige nativo/`uiohook`), `Notification` do Electron, `powerSaveBlocker` (keep-awake), `desktopCapturer` (screenshot), `systemPreferences.askForMediaAccess` (mic), `app.setAsDefaultProtocolClient('claudio')` (deep links), `open-file` event + `extendInfo` no electron-builder (doc types).

---

## 9. Desconhecidos / não confirmado

- Significado de `midnightOwl`, `slackWatch`, `sessionHalo`, `rubberDuck`, `velvetFinch`, `hushedHeronKey`, `violinBow`, `coworkKappa`, `coworkCopperHeron`, `copperLark*`, `telescopeBridge`, `louder/quietPenguin` — só nomes/flags vistos.
- Quais atalhos correspondem exatamente a quais itens de menu (só vi a lista de accelerators, não o pareamento completo — o brief "shell" deve cobrir).
- `api` do swift_addon: a busca por `.api.` trouxe muito ruído (métodos `registerEnvironment`, `pollForWork`, `reconnectSession` provavelmente são de outro objeto — Remote Control/environments); não confirmei pertencimento.
- Conteúdo do serviço instalado por `osEntryPoints` (título real e tipos aceitos são preenchidos em runtime).
- Strings da UI web (claude.ai) não estão no en-US.json → funcionalidades de chat em si (projetos, artifacts, memória etc.) não são mapeáveis por esta via.
- Não executei nada do bundle; tudo vem de strings, nomes de símbolos e leitura de JS minificado.
