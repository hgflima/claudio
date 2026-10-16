# Recon — MCP, Extensões, Conectores & Computer Use (Claude Desktop v2.42304.0)

Escopo: mcp-runtime, `claude_desktop_config.json`/`mcpServers`, extensões `.dxt`/`.mcpb`, conectores embutidos (GitHub, Microsoft 365), Claude in Chrome, Computer Use (`@ant/computer-use-mcp`, Teach, Watch/Record), bundled skills / UTType Skill, Imagine (`visualize`), `claudePagePreview.js`, artifact-libs / live artifacts.

Método: só leitura (rg/jq/unzip -l/plutil) do ASAR extraído, `en-US.json` e `Info.plist`. Nada foi executado.

Legenda: **[O]** observado no código/disco · **[I]** inferido.

Abreviações de arquivos (todos em `asar/.vite/build/`):

| Sigla | Arquivo | Conteúdo |
|---|---|---|
| `M` | `index.chunk-muI2IV6k.js` | Core do main process (7 MB) |
| `E` | `index.chunk-eU3m8z38.js` | LocalMcpServerManager |
| `U` | `index.chunk-CG7UT8IB.js` | Auto-update de extensões |
| `D` | `heavy-work-worker/dist-CI9lzb1v.js` | Lib mcpb (schemas de manifest) |
| `CU` | `index.chunk-BEf0UhNC.js` | @ant/computer-use-mcp (tools, tiers, gates) |
| `RD` | `index.chunk-BZtMzTi2.js` | Ponte "remote-devices" (`computer_*`) |
| `SK` | `index.chunk-CLw-GpZ1.js` | SkillsPlugin / SkillsFetcher |
| `IM` | `index.chunk-BaLvO2wi.js` | `getImagineServerDef` |
| `LA` | `index.chunk-B5tintml.js` | Servidores internos das sessões local-agent / Cowork |

> **Nota de arquitetura [O]:** `en-US.json` só tem 837 strings, todas do main process (menus, diálogos nativos, notificações). As telas Settings › Developer / Extensions / Connectors / Customize › Skills, o diálogo de aprovação de computer use e a renderização de widgets ficam no **renderer web (claude.ai remoto)**. O shell local fornece IPC, processos, arquivos e janelas nativas. Para o Claudio, toda essa UI precisa ser construída do zero em React.

---

## 1. Tabela de funcionalidades

Complexidade: P = pequena, M = média, G = grande. Prioridade pensada para o Claudio (Electron + React + Claude Agent SDK).

### 1.1 MCP local (config manual)

| ID | Funcionalidade | Comportamento para o usuário | Evidência | Cx | MVP |
|---|---|---|---|---|---|
| MCP-01 | Servidores MCP via `claude_desktop_config.json` | O usuário declara `mcpServers: {nome: {command, args?, env?}}` e o app sobe cada um como processo stdio. As tools ficam disponíveis no chat. | M: schema `yg=j({command,args,env,extensionId})`, `kBe="claude_desktop_config.json"` [O] | M | Must |
| MCP-02 | Caminho do config | `~/Library/Application Support/Claude/claude_desktop_config.json` (userData). Variante 3p usa `Claude-3p`. Override pela env `CLAUDE_USER_DATA_DIR`. | M: `Yg()` = `join(app.getPath("userData"), kBe)`, `Vl="-3p"` [O] | P | Must |
| MCP-03 | Validação do config | JSON inválido mostra "Couldn't load app settings: …error reading or parsing claude_desktop_config.json". Entradas inválidas são puladas com o aviso "Some MCP servers couldn't be loaded… skipped: {names}". Limite de 1 MiB. | en-US `rwFEudHXey`, `rfqC+v5aF0`, `ucijXSDDUQ`; M `ABe=1048576` [O] | P | Must |
| MCP-04 | Reload manual | Item de menu "Reload MCP Configuration". Em falha: "MCP Configuration Reload Failed". Não há file watcher. | en-US `uKCcuVd1Yt`, `qKeKrKCSD+`; M `P5r` → `mcpConfigChange` [O]; ausência de watcher [I] | P | Must |
| MCP-05 | Status por servidor | Cada servidor fica `initializing`, `running` ou `failed` (com mensagem de erro) na UI de Settings › Developer. | M: `vg={Initializing,Running,Failed}`, evento `mcpStatusChanged(name,status,error)` [O] | P | Must |
| MCP-06 | Edit Config / Open Logs / log por servidor | Botões que revelam o config no Finder (criando o arquivo se faltar), abrem a pasta de logs ou abrem o log de um servidor. | M: IPC `revealConfig`, `revealLogs`, `revealServerLog(name)` [O] | P | Must |
| MCP-07 | Logs MCP | `logs/mcp.log` agrega warn+. Cada servidor tem `logs/mcp-server-<name>.log`. Os logs entram no Support Bundle. | M: `C8r`, `w8r(e)`, `T8r=/^mcp-server-.*\.log$/` [O] | P | Should |
| MCP-08 | Menu Developer / Help | Itens: "Open Developer Config File", "Open MCP Log File", "Reload MCP Configuration", "Install Extension…", "Install Unpacked Extension…", "Open Extensions Folder", "Enable Developer Mode…". | en-US `M+KRNXNx21`, `ewJhC1J2qh`, `0aNzENRakz`, `H37kTzMmG0`, `xjEv4cOudI` [O] | P | Should |
| MCP-09 | "Use built-in Node.js for MCP" | Toggle (ligado por padrão). Servidores Node rodam no Node do Electron sem exigir Node instalado. Se o servidor tenta dar fork em node, aparece um erro explicando para instalar Node e desligar o toggle. | `mcp-runtime/nodeHost.js` (`SelfExecBlockedError`, `ERR_MCP_NODE_HOST_NOT_NODE`); M `setIsUsingBuiltInNodeForMcp` [O] | M | Should |
| MCP-10 | Servidores MCP remotos (HTTP/SSE) | Proxy em utilityProcess com elicitation, reauth OAuth e reconexão. | `mcp-runtime/directMcpHost.js` (`addServer`, `elicitation`, `authRejected`) [O] | G | Later |
| MCP-11 | Aprovação de tools / timeouts | Timeout por tool call, "always allow" persistente e consentimento por chamada para tools sensíveis. | Políticas `mcpToolTimeoutSec`, `mcpPersistentAlwaysAllowEnabled`; gates `sensitive_mcps_per_call_consent`, `mcp_tool_approval_config` [O]; UX exata [I] | M | Should |

### 1.2 Extensões (.dxt/.mcpb), conectores e importação

| ID | Funcionalidade | Comportamento para o usuário | Evidência | Cx | MVP |
|---|---|---|---|---|---|
| EXT-01 | Instalar extensão `.dxt`/`.mcpb` | Entradas: duplo clique ou arrastar o arquivo, menu "Install Extension…" (diálogo filtrado), "Install Unpacked Extension…" (pasta, Developer Mode) e Extensions Directory. Em seguida vem um preview: "Install Extension? Do you want to install {extensionName}?" | M: `app.on("open-file")` → `handleDxtFile`, `V7r` showOpenDialog `["dxt","mcpb"]`; Info.plist "Desktop Extension" (`dxt`, `mcpb`); en-US `jBm3zDnv2K`, `7Vb+9Gxf0X` [O] | G | Later |
| EXT-02 | Formulário `user_config` | O manifest declara campos (string, number, boolean, directory, file; sensitive, required, default, min, max, multiple) e o app gera um formulário de configuração. Os valores são substituídos em `${user_config.X}`, `${__dirname}` e `${/}`. Se um campo obrigatório faltar, o servidor não sobe. | D: `vr(["string","number","boolean","directory","file"])`; M `Qst()` [O] | M | Later |
| EXT-03 | Segredos cifrados | Campos `sensitive` são guardados via `safeStorage` (Keychain) como `"__encrypted__:<b64>"`. Sem keyring, ficam em plaintext com aviso. | M `L5r`/`R5r`; en-US `ZoeAQvufEY` [O] | P | Later |
| EXT-04 | Habilitar / desabilitar / remover extensão | Cada extensão tem toggle e botão de remover. Uma entrada do usuário no config com o mesmo nome sobrescreve a extensão. | IPC `setExtensionSettings`, `deleteExtension`; M `kY()` [O] | P | Later |
| EXT-05 | Checagem de compatibilidade | O preview bloqueia por plataforma, versão do Claude, runtime Node/Python ausente ou versão incompatível. | M `jBt` (`platform-mismatch`, `no-python-installed`…), manifest até 0.4 [O] | M | Later |
| EXT-06 | Instalação de dependências (uv/Python) | "In order to install this extension we need to fetch a few dependencies…" | en-US `NHWp3lt/nF`; M `case"dynamic-uv"` [O] | M | Later |
| EXT-07 | Auto-update de extensões | Checa a cada 6 h, baixa para um cache e aplica com backup e rollback. Toggle `isDxtAutoUpdatesEnabled`. | U ("Starting periodic extension update checks", "rolling back"); en-US `FKjTG319D2` [O] | M | Later |
| EXT-08 | Assinatura / allowlist / blocklist da org | Mostra signed/unsigned com publisher. A org pode exigir assinatura, usar allowlist (`/dxt/can_install`) ou blocklist (revisada a cada 2 h); extensões bloqueadas são desabilitadas com aviso. | M `Jza`, `Yza`, `e7`; en-US `LbOc+guZ5S`, `rCO+ULu7rr`, `GVyJhCRuT8` [O] | G | Later (enterprise; fora do escopo pessoal) |
| EXT-09 | Extensions Directory | Catálogo hospedado em `claude.ai/api/organizations/{org}/dxt`, com download e barra de progresso. | M `p9r`, evento `extensionDownloadProgress` [O] | G | Later (depende de backend Anthropic) |
| CON-01 | Conector GitHub embutido | O admin define o conector em `managedMcpServers`. O usuário faz login em Settings › Connectors via OAuth Device Flow ("Enter this code on the GitHub page", código copiado). Roda o binário Go `github-mcp-server` com o token em env. | `resources/github-mcp/github-mcp-server`; `index.chunk-PgIKnH0P.js`, `index.chunk-Cpn90bTr.js`; env `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOOLSETS`, `GITHUB_READ_ONLY` [O] | M | Later (substituível por config MCP comum) |
| CON-02 | Conector Microsoft 365 embutido | Login MSAL (broker nativo). 59 tools: Outlook (mail/calendário), SharePoint/OneDrive e Teams. Só aparece via política do admin. | `resources/office365-mcp/office365-mcp-stdio.mjs`; M `server==="microsoft365"` [O] | G | Later |
| CON-03 | Importar de "Claude (third-party)" | Migra servidores MCP, extensões e skills da variante 3p: "Add these # MCP servers to Claude?" | en-US `SMwJOjXTVO`, `aYW0/4J+hn`, `GeC5mbbBqj` [O] | P | Later (no Claudio: "importar do Claude Desktop" seria útil → Should) |

### 1.3 Skills

| ID | Funcionalidade | Comportamento para o usuário | Evidência | Cx | MVP |
|---|---|---|---|---|---|
| SKL-01 | Skills Anthropic sincronizadas | Aparecem em Customize › Skills e entram nas sessões agente como plugin `anthropic-skills:<nome>`. Sync a cada 10 min e ao focar a janela. | SK `[SkillsPlugin]`, `[SkillsFetcher]`; `list-skills`, `download-dot-skill-file` [O] | M | Should |
| SKL-02 | Bundled skills offline | 6 skills no asar (docx, pdf, pdf-reading, pptx, xlsx, frontend-design), `tier:"always"` (ligadas por padrão). São usadas sem conta claude.ai ou quando a org desliga Skills. | `resources/bundled-skills/manifest.json` (`agentSkillsRef:"1792020044"`) [O] | P | Should (usar skills próprias/abertas, não as da Anthropic) |
| SKL-03 | Skills locais do usuário (CRUD) | Criar, editar, renomear, apagar, ligar/desligar, "Reveal in Finder" e upload de zip/.skill. | IPC `LocalAgentModeSessions.{listLocalSkills, saveLocalSkill, renameLocalSkill, deleteLocalSkill, setLocalSkillEnabled, revealLocalSkill, saveLocalSkillArchive}` [O] | M | Must (o Agent SDK já carrega skills de `~/.claude/skills`; o Claudio só precisa da UI) |
| SKL-04 | Validação de upload | Exige exatamente 1 SKILL.md. Rejeita hooks, commands, agents e `.mcp.json` ("only a plugin can carry"). Nome com até 255 caracteres, sem prefixo `anthropic-skills:`. | en-US "Couldn't find SKILL.md in this file.", "…more than one skill…" [O] | P | Should |
| SKL-05 | Abrir `.skill` com duplo clique (UTType) | O SO abre o Claude e o app mostra um preview da skill para confirmar a instalação. Limite de 30 MB. | Info.plist `com.anthropic.skill` (rank Owner); M `wsn()` → `dispatchPreviewSkillFile`, `iMa=31457280` [O] | P | Should |
| SKL-06 | Skills built-in só de prompt | `consolidate-memory`, `setup-claude`, `explain-usage` (e `setup-cowork`, oculta). | M `M$t`, `N$t`, `F$t`, `P$t` [O] | P | Later |
| SKL-07 | Menu `/` com skills | As skills aparecem no slash menu do composer. | IPC `respondSlashMenuSkills` [O]; UX [I] | P | Must |

### 1.4 Computer Use

| ID | Funcionalidade | Comportamento para o usuário | Evidência | Cx | MVP |
|---|---|---|---|---|---|
| CU-01 | Toggle "Computer use" em Settings | Vem desligado por padrão. Desligado, as tools respondem "Computer control is disabled in Settings." | M pref `chicagoEnabled` [O] | P | Later |
| CU-02 | Permissões macOS (TCC) | Card "Set up computer use" que pede Accessibility, Screen Recording e Microfone e abre o painel do System Settings. | IPC `ComputerUseTcc.{getState, requestAccessibility, requestScreenRecording, requestMicrophone, openSystemSettings}` [O] | M | Later |
| CU-03 | Aprovação por app (`request_access`) | Diálogo lista os apps pedidos com um motivo. O usuário aprova o conjunto e marca checkboxes de clipboard leitura/escrita e system keys. Grants podem ser revogados. | CU tool `request_access`; IPC `revokeGrant` [O]; visual do diálogo [I] (renderer web) | M | Later |
| CU-04 | Tiers por categoria de app | Browsers e apps de trading/cripto: só screenshot. Terminais e IDEs: só clique. Demais apps: controle total. Mídia/streaming bloqueados. O próprio Claude nunca pode ser alvo. | M `gsr`/`Xor`, `rsr` [O]; categoria mídia [I] | M | Later |
| CU-05 | Controle de tela inteira | Screenshot, zoom, cliques, digitação, teclas, scroll, drag, open_application, switch_display, clipboard e `computer_batch`. | CU (lista de tools na §2.6) [O] | G | Later |
| CU-06 | Modo background / app-scoped (macOS ≥ 15) | O Claude opera janelas de apps sem tomar a tela (via árvore AX, `app_*`), com um "phantom cursor" na janela controlada. `request_full_control` pede para tomar a tela. | CU `app_screenshot`, `app_click`, `app_menu`…; pref `chicagoPreferredMode="background"` [O] | G | Later |
| CU-07 | Indicadores visuais | Glow em volta da tela com badge "Claude is using your computer". A janela principal vira painel lateral always-on-top. Notificações de início e fim. Live preview de frames (500 ms) no app. | M `[cu-glow]`, `[cu-side-panel]`, `[cu-notifications]`, `[cu-live-preview]` [O] | M | Later |
| CU-08 | Parar com Esc / Stop | Esc global para todas as sessões de CU (o Esc sintetizado pelo modelo é ignorado). Botão Stop na janela. Só uma sessão por vez segura o lock. | M `[cu-esc]` `globalShortcut.register("Escape")`, `onCuEmergencyStop` [O] | P | Later |
| CU-09 | Ocultar apps fora da allowlist | Apps não aprovados são ocultados antes das ações e reexibidos depois. Também são excluídos do screenshot no macOS. | gate `hideBeforeAction`, pref `chicagoAutoUnhide` [O] | M | Later |
| CU-10 | Modo Teach | O Claude guia o usuário passo a passo: overlay transparente com tooltip ancorado ("Teaching", explicação, preview do próximo passo) e botões **Next**/**Exit**. Ao clicar Next, executa as ações e tira novo screenshot. | `computerUseTeach.js` (IPC `CuTeach.{next, exit, show, working, hide}`); CU `request_teach_access`, `teach_step` [O] | G | Later |
| CU-11 | Record a skill / Share screen (Watch-Record) | Um chooser escolhe o microfone e a narração. Durante a gravação há uma pílula flutuante (Done/Discard/mic), com limite de 10 min e aviso aos 9. "skill" gera uma skill a partir da demonstração; "context" permite revisar e cortar no composer antes de enviar. | `computerUseWatchRecord.js`, `watchRecordChooser.js` (IPC `CuWatchRecordChooser`, `CuWatchRecordPill`); M título "Record a skill"; IPC `startWatchRecording`, família `CopperHeron` [O] | G | Later |
| CU-12 | CU para sessões remotas | Sessões na nuvem/celular controlam este Mac via `mcp__remote-devices__computer_*`. | RD [O] | G | Later |

### 1.5 Claude in Chrome, Imagine, preview e artifacts

| ID | Funcionalidade | Comportamento para o usuário | Evidência | Cx | MVP |
|---|---|---|---|---|---|
| CHR-01 | Claude in Chrome (bridge com a extensão) | O app instala o host de native messaging em Chrome, Brave, Arc, Edge etc. A extensão se pareia via socket unix assinado (local) ou WebSocket `bridge.claudeusercontent.com` (remoto). Tools de navegador ficam disponíveis no chat. | M `[Chrome Extension MCP]`, manifest `com.anthropic.claude_browser_extension`, `Contents/Helpers/chrome-native-host`; IPC `ChromeExtension.*` [O] | G | Later (o Claudio não tem a extensão oficial; alternativa: Playwright MCP ou chrome-devtools MCP via config) |
| CHR-02 | Painel Browser interno para sessões Code | `$BROWSER` aponta para um shim que abre URLs no painel Browser do app, com fallback para `open`. | `Contents/Resources/claude-browser-shim.js` (`CLAUDE_BROWSER_BRIDGE`) [O] | M | Should |
| IMG-01 | Inline visualizations ("Imagine") | Em sessões agente, o Claude desenha SVG/HTML interativo inline no chat (gráficos, diagramas, mockups), com mensagens de loading, botão de download e `sendPrompt(text)` para o widget falar com o chat. | IM `getImagineServerDef` (server `visualize`, tools `show_widget`, `read_me`; resource `ui://imagine/show-widget.html`, MCP Apps) [O] | G | Should (diferencial forte; dá para começar só com SVG/HTML em iframe sandbox) |
| PRV-01 | Preview de artifacts publicados | Quando o agente publica um artifact claude.ai, ele abre no painel Preview, já logado e sem o chrome do site. Há fullscreen (Esc sai). Uma ponte MessagePort dá ao artifact acesso a tools locais. | `claudePagePreview.js`; M `loadClaudePagePreview`, `openPublishedArtifact`, `[ArtifactHostTools]` [O] | G | Later (depende de claude.ai) |
| ART-01 | Live artifacts do Cowork | Páginas HTML persistentes na sidebar. Leem dados frescos de conectores (`window.cowork.callMcpTool`), podem perguntar ao Claude (`askClaude`, Haiku) e disparar tarefas agendadas. Recursos: reload, favoritar, renomear, versões, exportar PDF, compartilhar/publicar. | `coworkArtifact.js`; M protocolo `cowork-artifact://`; IPC `CoworkArtifacts_$_*` [O] | G | Later (em transição para "legacy" no próprio app [O]) |
| ART-02 | Libs de artifact offline | Chart.js 4.5.0, Grid.js 5.0.2 e Mermaid 11.17.2 são servidas localmente interceptando as URLs de CDN, com SRI. Todo o resto da rede é bloqueado (`connect-src 'none'`). | `resources/artifact-libs/*`; M `protocol.handle("https")` + `webRequest.onBeforeRequest` [O] | M | Should (bom padrão de segurança para renderizar HTML do modelo) |
| ART-03 | Gate de popups/links externos em artifacts | Abrir URL ou app externo a partir de um artifact exige clique recente e confirmação: "This artifact wants to open {url}", "Always allow {protocol} links from artifacts". | en-US `uwYSX/zxat`, `eE1aC5bLLT`, `MPi1EvvGO5`; M `[artifactPopup] gate` [O] | P | Should |

---

## 2. Detalhes técnicos para reimplementar

### 2.1 Runtime MCP local [O]

**Escolha do runtime** (M `TBt`/`AWt`/`kWt`):

| Runtime | Quando | Como |
|---|---|---|
| `built-in-node` | `command` é `node <script>` ou um `.js/.mjs/.cjs`, toggle ligado, e `compatibility.runtimes.node` satisfeito (ou Node ausente no sistema) | `utilityProcess.fork(nodeHost.js, [entry, ...args], {serviceName:"Claude Desktop MCP Node Host", stdio:"pipe"})`. Env com `NODE_EXTRA_CA_CERTS`, `NODE_USE_SYSTEM_CA=1`, proxy e PATH do shell. Spawn timeout de 30 s (60 s no Windows). |
| `exec` / `python` / `dynamic-uv` | Demais casos | `StdioClientTransport` do SDK MCP, com process group (mata o grupo inteiro), `maxBufferSize` de 32 MiB, PATH do shell do usuário e `${PATH}` expandido. Antes de subir, checa se o executável existe (`MissingExecutableError`). |
| remoto | HTTP/SSE | `directMcpHost.js` em utilityProcess. Mensagens `addServer`, `elicitation`/`elicitationResult`, `authRejected`, `ready`/`error`. Fecha após 3 erros terminais. |

**`nodeHost.js`:**
- Recebe `init` com uma MessagePort.
- Faz proxy de stdin/stdout/stderr como mensagens `{type}`.
- Faz `import()` do entry.
- Reporta `fatal-error` e `self-exec-blocked`.
- Intercepta `spawn`/`execSync` apontando para o próprio binário do app. Com 20 recusas em 5 s, aborta.

**LocalMcpServerManager (E, sessões agente):**
- Tools nomeadas `mcp__<server>__<tool>`.
- Timeout de conexão de 60 s; a sessão continua sem o servidor.
- Reusa conexões e filtra tools desabilitadas.
- Pula nomes que colidem com servidores internos.

**Para o Claudio [I]:** o Claude Agent SDK já aceita `mcpServers` (stdio/http/sse) nas `options`. O mais simples é ler o config, validar com zod e passar adiante. O status de cada servidor pode vir das mensagens `system/init` do SDK, que listam `mcp_servers` com status.

### 2.2 Schema `claude_desktop_config.json` [O]

```jsonc
{
  "mcpServers": { "<nome>": { "command": "…", "args": ["…"], "env": {"K":"V"} } },
  "features": { "isDxtEnabled": true, "isDxtDirectoryEnabled": true,
                "isLocalDevMcpEnabled": true, "isUvSystemPythonEnabled": false },
  "isUsingBuiltInNodeForMcp": true,
  "isDxtAutoUpdatesEnabled": true,
  "dxtMaxTotalSizeMB": 0,
  "deploymentMode": "1p",          // "1p" | "3p"
  "globalShortcut": "…",
  "chromiumFlags": []
}
```

- Semântica das flags em `features`: `!== false` conta como ligado.
- Arquivo separado `developer_settings.json`: `{allowDevTools}`.

### 2.3 IPC

Formato dos canais: `$eipc_message$_<uuid>_$_claude.<namespace>_$_<Interface>_$_<método>` [O].

| Interface | Métodos | Eventos |
|---|---|---|
| `claude.settings / MCP` | `isLocalDevMcpEnabled`, `setMcpServerConfigs`, `getMcpServersConfig(forceReload)`, `getMcpServersConfigWithStatus`, `revealConfig`, `revealLogs`, `revealServerLog(name)` | `mcpConfigChange`, `mcpStatusChanged(name,status,error)` |
| `Extensions` | `getInstalledExtensionsWithState`, `getManifestCompatibilityResult`, `installDxt`, `installDxtUnpacked`, `installDxtFromDirectory`, `handleDxtFile`, `showInstallDxtDialog`, `installExtensionFromPreview`, `get/setExtensionSettings`, `deleteExtension`, `openExtensionsFolder`, `getIsUpdateAvailable`, `refreshAllowlistCheck`… | `extensionsChanged`, `extensionSettingsChanged`, `previewExtensionInstallation(manifest,path,id,signatureInfo)`, `extensionDownloadProgress` |
| `AppConfig` | `getAppConfig`, `setAppFeature`, `setIsUsingBuiltInNodeForMcp`, `setIsDxtAutoUpdatesEnabled` | — |
| `LocalAgentModeSessions` (skills / record) | `listLocalSkills`, `getLocalSkillFiles`, `saveLocalSkill`, `saveLocalSkillArchive`, `renameLocalSkill`, `deleteLocalSkill`, `setLocalSkillEnabled`, `revealLocalSkill`, `syncSkills`, `respondSlashMenuSkills`, `startWatchRecording`, `finalizeCopperHeron`… | `onFolderSkillsCapped`, `watchRecordingComplete` |
| `claude.skills / Skills` | — | `onPreviewSkillFile(bytes, filename)` |
| `ComputerUseTcc` | `getState`, `requestAccessibility`, `requestScreenRecording`, `requestMicrophone`, `openSystemSettings(pane)`, `revokeGrant`, `listInstalledApps` | — |
| `ComputerUseLivePreview` | `setFps`, `setSubscribed(sessionId, subscribed, wantsCapture)` | — |
| `claude.internal.computerUse` | `CuTeach.{next, exit, mouseEnter, mouseLeave}`; `CuWatchRecordChooser.{choose, setMicPreview, stopMicPreview}`; `CuWatchRecordPill.{done, discard, toggleMic}` | `show`/`working`/`hide`; `micState`, `timeWarning`, `processing` |
| `ChromeExtension` | `isInstalled`, `installExtension`, `restartChrome`, `getBrowserActivity`, `launchBrowser`, `getConnectedExtensions` | `connectedExtensionsChanged` |
| `claude.coworkArtifact / CoworkArtifactBridge` | `callMcpTool`, `askClaude`, `runScheduledTask`, `navigateHost`, `openExternalUrl`, `setEditableFocused` | — |

Canais `ipcRenderer` simples do preview [O]:
- `claude-page:host-tools-hello` / `claude-page:host-tools-port` (MessagePort)
- `claude-page:subframe-pointerdown`
- `claude-page:subframe-exit-pointer-lock`

Fluxos associados a eventos [O]:
- Emergência de computer use: `onCuEmergencyStop(sessionId, orgUuid)`.
- Mudança do lock de CU: `cuLockChanged`.

### 2.4 Disco [O]

```
~/Library/Application Support/Claude/
├─ claude_desktop_config.json
├─ developer_settings.json
├─ Claude Extensions/<id>/                manifest.json + código
├─ Claude Extensions Settings/<id>.json   {isEnabled, userConfig, orgBlockedReason, …}
├─ Extensions Update Cache/   dxt-staging/
├─ local-agent-mode-sessions/skills-plugin/<org>/<account>/
│   ├─ .claude-plugin/plugin.json         {"name":"anthropic-skills", …}
│   ├─ manifest.json                      skills[] {skillId,name,description,creatorType,enabled,…}
│   ├─ skills/<nome>/SKILL.md
│   └─ .aside/
└─ cowork-managed/Artifacts/<id>/   Scheduled/<id>/
~/Library/Logs/Claude/   mcp.log, mcp-server-<name>.log, chrome-native-host.log, app-cu-helper.log
```

- IDs de extensão: `local.dxt.<slug>`, `local.mcpb.<slug>`, `local.unpacked.<slug>` ou o ID do diretório.
- Caminho exato da pasta de logs no macOS (`app.getPath("logs")`) [I].

### 2.5 Manifest de extensão (mcpb 0.1–0.4) [O]

Campos:
- `manifest_version` (ou o legado `dxt_version`), `name`, `display_name`, `version`, `description`, `long_description`, `author`, `repository`, `homepage`, `documentation`, `support`, `icon`/`icons`, `screenshots`, `keywords`, `license`, `privacy_policies`, `localization`, `_meta`.
- `server`: `{type: node|python|binary|uv, entry_point, mcp_config:{command,args,env,platform_overrides}}`.
- `tools`, `tools_generated`, `prompts`, `prompts_generated`.
- `compatibility`: `{platforms, runtimes:{node,python}, claude_desktop}`.
- `user_config`: `{<key>: {type, title, description, sensitive, required, default, min, max, multiple}}`.

Variáveis de substituição: `${user_config.X}`, `${__dirname}`, `${pathSeparator}`, `${/}`.

O formato é aberto (spec do MCPB). Reimplementar a instalação é viável sem nada proprietário [I].

### 2.6 Computer Use: tools e gates [O]

**Display (tela inteira):**
- Acesso: `request_access`, `list_granted_applications`.
- Captura: `screenshot`, `zoom`, `cursor_position`.
- Mouse: `left_click`, `double_click`, `triple_click`, `right_click`, `middle_click`, `left_click_drag`, `mouse_move`, `left_mouse_down`, `left_mouse_up`, `scroll`.
- Teclado: `type`, `key`, `hold_key`.
- Outras: `wait`, `open_application`, `switch_display`, `read_clipboard`, `write_clipboard`, `computer_batch`.

**App-scoped (macOS ≥ 15):**
- Controle da tela: `request_full_control`, `release_full_control`, `app_bring_to_current_space`, `app_release`.
- Inspeção: `list_apps`, `app_list_windows`, `app_screenshot` (inclui a árvore AX com índices), `app_zoom`, `app_ax_find`.
- Ações: `app_click`, `app_type`, `app_key`, `app_scroll`, `app_focus`, `app_drag`, `app_menu`, `app_batch`.

**Teach:** `request_teach_access`, `teach_step`, `teach_batch`. **Window Halo (LA):** `halo_attach`, `halo_detach`.

**Configuração:**
- Gate GrowthBook `1291166712` ("chicago" é o codinome do CU), com sub-gates `hideBeforeAction`, `mouseAnimation`, `clipboardGuard`, `adaptiveResolution` e `coordinateMode`.
- Prefs: `chicagoEnabled`, `chicagoPreferredMode`, `chicagoAutoUnhide`, `chicagoUserDeniedBundleIds`.
- macOS mínimo: 14 (15 para o modo app-scoped).

**Nativo:**
- `@ant/claude-swift`: `computer_use.node` (AX, captura excluindo janelas) e `watchRecorder`.
- `@ant/claude-native`: Rust; `cuListRunningApps`, `cuLaunchApp`, `typeTextPaced`, `getFrontmostAppInfo`.
- Helper `Contents/Helpers/app-cu-helper`: JSON-RPC com `probe` e `dispatchRaw`.

**Para o Claudio [I]:** o caminho barato é rodar um MCP de computer use open-source ou a tool `computer` da API em sessões do Agent SDK. Glow, tiers e app-scoped exigem um addon nativo próprio (Swift/AX), e são esses os itens G.

### 2.7 Claude in Chrome [O]

- **Native messaging host:**
  - nome: `com.anthropic.claude_browser_extension`;
  - binário: `Contents/Helpers/chrome-native-host`;
  - `allowed_origins`: `dihbgbndebgnbjfmelmegjepbnkhlgni`, `fcoeoabgfenejglbffodgkkbkcdhcgfn`, `dngcpimnedloihjnnfngkgjoidhnaolf`.
- **Instalação:** o app instala ou remove o manifest em `…/NativeMessagingHosts` de Chrome, Brave, Chromium, Arc, Vivaldi, Opera e Edge, e vigia mudanças nessas pastas.
- **Transporte local:** socket em `claude-mcp-browser-bridge-*` (diretório 0700, sem symlink), com pareamento assinado (JWKS, `requiredOrg`).
- **Transporte remoto:** `wss://bridge.claudeusercontent.com/devices/<id>/bridge`.
- **Tools:** os schemas vêm da extensão. Nenhum chunk local contém as definições [I].

### 2.8 Imagine (`visualize`) [O]

- **`show_widget({loading_messages[1..4], title, widget_code})`:** SVG se o código começa com `<svg`, senão um fragmento HTML. Os scripts só rodam após o streaming terminar. Global `sendPrompt(text)`.
- **`read_me({modules[], platform})`:** devolve um guia de design (CSS vars, largura 380 no mobile e 680 no desktop) e fica oculto no chat (`_meta["claude.ai/hidden_in_chat"]`).
- **Resource:** `ui://imagine/show-widget.html`, mime `text/html;profile=mcp-app`. CSP permite esm.sh, cdnjs, jsdelivr, unpkg e Google Fonts; `clipboardWrite`.
- **Gate e política:** gate `3444158716`. A política da org `inline_visualizations` bloqueia, assim como o gate HIPAA.

### 2.9 Live artifacts e artifact-libs [O]

- **Protocolo e sessão:** protocolo `cowork-artifact://local/<id>/…`, sessão `persist:cowork-artifact-<org>-<account>` com todas as permissões negadas.
- **Rede:** `webRequest` cancela tudo exceto o próprio esquema e 4 URLs de CDN. `protocol.handle("https")` serve essas URLs a partir de `resources/artifact-libs/`.
- **CSP:** `default-src 'self'; script-src 'self' 'unsafe-inline' <CDNs>; connect-src 'none'; frame-src 'none'; form-action 'none'`.
- **Metadados:** `<script type="application/json" id="cowork-artifact-meta">{name, description, mcpTools[], mcpServerNames[], schemaVersion:1}</script>`.
- **Ponte do preload:** `window.cowork = {callMcpTool(name,args), askClaude(prompt,data), runScheduledTask(id)}`. Exige o formato `mcp__<server>__<tool>`; `runScheduledTask` exige user activation.
- **Tools do agente** (servidor `cowork`): `create_artifact`, `update_artifact`, `list_artifacts`, `verify_artifact`, `screenshot_artifact`, `read_widget_context`.

### 2.10 Skill via UTType / open-file [O]

- **Info.plist:**
  - `UTExportedTypeDeclarations`: `com.anthropic.skill`, conforme `public.zip-archive`, extensão `.skill`.
  - `CFBundleDocumentTypes`: "Skill File" (Owner) e "Desktop Extension" (`dxt`, `mcpb`).
- **Roteamento do `app.on("open-file")`:**
  - `.skill` → envia os bytes ao renderer (`previewSkillFile`); a UI confirma;
  - `dxt`/`mcpb` → preview de extensão;
  - pasta → "folder drop";
  - outros → anexar ao chat.
- **Robustez:** arquivos abertos antes do app ficar pronto ficam pendentes; também lê `process.argv`.

---

## 3. Desconhecidos

- **Visual das telas web:** Settings › Developer/Extensions/Connectors, Customize › Skills, o diálogo de `request_access` e a renderização dos widgets ficam no renderer claude.ai e não foram vistos.
- **Restart de servidores stdio:** não confirmei se há restart automático quando um servidor cai. Só vi auto-reconnect para remotos/direct e o status `failed`.
- **Deep link de instalação:** nenhum `claude://` para instalar extensões foi encontrado. Instalação por URL `.mcpb` só aparece no contexto de plugins.
- **Detalhes de extensões não analisados:** default e uso de `dxtMaxTotalSizeMB`; cadeia de verificação de assinatura (`signatureInfo`); se `local.unpacked` exige `developerModeEnabled` explicitamente [I].
- **Lista de apps bloqueados por política no CU:** categoria mídia/streaming inferida; a definição está minificada.
- **Record a skill:** como a gravação vira SKILL.md (provavelmente no servidor) não foi analisado. Não há atalho global para iniciar a gravação.
- **Ponte host-tools do preview:** protocolo sobre a MessagePort e significado de `hostcaps` não detalhados.
- **Flags opacas:** `1942337209`, `123929380`, `2742800629`; "Trajectory Lab"; `SableOtterHud`.
- **Skills em 1P:** não confirmei se as bundled skills também são semeadas offline em 1P. Na máquina do usuário (1P) não aparecem `frontend-design`/`pdf-reading`, o que sugere que vale a lista da API [I].
- **`/libs/imagine/*`:** não está no asar; presumo que seja servido pelo claude.ai [I].
