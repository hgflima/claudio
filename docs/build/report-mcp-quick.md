# Relatório — agente `mcp-quick`

## O que foi feito
### Main (`src/main/mcp/`)
| Arquivo | Conteúdo |
|---|---|
| `config.ts` | Lê/escreve `userData/claudio_config.json` (`{ mcpServers }`, compatível com `claude_desktop_config.json`). Validação zod: stdio `{command,args,env}`, remoto `{type:'http'\|'sse',url,headers}`, `{url}` sem `type` vira `http`, `disabled?: boolean`. Inválidos são ignorados com `log.warn` mas **preservados** no arquivo. Outras chaves de topo do arquivo são preservadas. Rename mantém a posição. Import do Claude Desktop copia só nomes novos e válidos. |
| `probe.ts` | Conecta com `@modelcontextprotocol/sdk` Client (Stdio com env do `getShellEnv()` + env do server, cwd = home; StreamableHTTP; SSE), pagina `listTools`, timeout 20s, sempre fecha. 401/403/`UnauthorizedError` → `needs-auth`. stderr e eventos de probe → `logs/mcp-server-<name>.log`. |
| `skills.ts` | `~/.claude/skills/*/SKILL.md` (user), `<cwd>/.claude/skills` (project), plugins via `~/.claude/plugins/installed_plugins.json` (`installPath/skills/*`) + `~/.claude/plugins/synced/*/<plugin>/skills/*`. Nomes de plugin no formato `plugin:skill`. Frontmatter: escalares, aspas, blocos `>`/`\|`. |
| `index.ts` | `registerMcp()` com todos os canais `mcp:*` e `skills:list`; testa todos os habilitados em background no startup e no `mcp:reload`; após upsert/remove só re-testa o que mudou. Resultados antigos de probe são descartados (contador de geração). Toda mudança → `bus.emitBus('mcp:config-changed')` + `emit('mcp:changed')`. `getEnabledMcpServers()` no formato do Agent SDK. |
| `quick.ts` | `registerQuickEntry()`: janela `type:'panel'`, frameless, transparente, sem sombra nativa (sombra é CSS), `alwaysOnTop('pop-up-menu')`, todos os workspaces + fullscreen, `hiddenInMissionControl`, skipTaskbar. Altura automática via `enablePreferredSizeMode` + `preferred-size-changed` (140–560 px), largura 728 (card de 680 + margem para a sombra). Centralizada no display do cursor (28% da altura); posição salva por display em `userData/quick-window.json` quando movida (só reaplicada se couber na tela). Esconde no blur. Atalho global de `settings.quickEntryShortcut`, re-registrado via `settingsEvents`; falha → log. `quick:submit` (validado com zod) → esconde, `showMainWindow()`, `quick:submitted` (espera `did-finish-load` + 300 ms se a main estiver carregando). `quick:shortcutStatus` → `{ accelerator, registered, error? }`: `invalid-accelerator` quando o Electron rejeita o accelerator, `registration-failed` quando outro app já usa o atalho; atalho vazio = `registered:false` sem erro. O status é atualizado a cada (re)registro. Exporta também `showQuickEntry`, `hideQuickEntry`, `toggleQuickEntry`. A janela é pré-criada no register para o primeiro atalho abrir instantaneamente. |

### Renderer
- `features/mcp/McpSettings.tsx`: lista com status (bolinha + texto, nº de tools), linha expansível (erro + chips com as tools), toggle enable, Test, Edit, Remove (com confirmação inline), Add server (form: nome, tipo stdio/HTTP/SSE, command, args linha a linha, env `KEY=VALUE`, url, headers `Name: value`), Reload, Open config file, Open logs, Import from Claude Desktop (mostra importados/ignorados). Estado vazio com dica.
- `features/mcp/SkillsSettings.tsx`: agrupado por Personal / Project / Plugins, descrição, botão revelar no Finder (`app:showItemInFolder`), Refresh, dica de onde criar skills. Prop opcional `cwd`.
- `features/quick/QuickEntry.tsx`: card arredondado com sombra, textarea com autofocus e auto-grow ("How can I help you today?"), seletor de destino (Chat | pastas recentes; lembra a última escolha em `localStorage`), colar/arrastar imagens com thumbnails removíveis, Enter envia, Shift+Enter quebra linha, Esc fecha o menu de destino ou dispensa a janela, tema claro/escuro (`settings:get` + `settings:changed` + `prefers-color-scheme` no modo system). O menu de destino fica no fluxo do card (não é popover), para a janela crescer junto.

## Como testar manualmente
1. `npm run dev`. Aperte **⌥Space**: o Quick Entry aparece centralizado no monitor do cursor.
2. Digite, cole uma imagem (⌘V de um screenshot) → thumbnail aparece. Troque o destino no seletor. Enter → a janela some, a main vem para frente e recebe `quick:submitted` (ver DevTools da main).
3. Arraste o card para outro lugar, feche (Esc), reabra: deve voltar na mesma posição. Clique fora: deve sumir.
4. Settings › MCP: "Add server" → stdio `npx` com args `-y`, `@modelcontextprotocol/server-everything` → em poucos segundos fica "Connected · N tools". Expanda para ver as tools.
5. Adicione um HTTP `https://api.githubcopilot.com/mcp/` sem headers → "Needs authentication".
6. Adicione um command inexistente → "Failed" com erro `spawn … ENOENT` expansível. "Open logs" → existe `mcp-server-<nome>.log`.
7. Toggle off → "Disabled"; "Open config file" mostra `"disabled": true`. Edite o arquivo à mão e clique "Reload".
8. Settings › Skills: lista as skills de `~/.claude/skills` e dos plugins instalados.

**Já verificado fora do Electron** (script Node com `jiti` + mock de `electron`, no scratchpad): parse/validação do config, rename preservando ordem e chaves extras, probe stdio real (2 tools, stderr logado, env repassado), ENOENT → failed, HTTP 401 → needs-auth, frontmatter, `listSkills` (178 skills nesta máquina), import do Claude Desktop. `npm run typecheck`: meus arquivos sem erros. `npx electron-vite build`: OK.

## Limitações / TODOs
- OAuth para servidores remotos não é suportado: `needs-auth` orienta a colocar um header `Authorization`.
- Sem file watcher no config: edições manuais exigem "Reload" (igual ao Claude Desktop, MCP-04).
- O probe é um teste isolado. As sessões do Agent SDK sobem os próprios processos MCP; o status mostrado não reflete a conexão dentro de uma sessão em andamento.
- Quick Entry: o rascunho é mantido entre aberturas (limpo só ao enviar); não há lista de chats recentes como destino, só pastas; sem "skooch" ao crescer perto da borda inferior da tela.
- Entrega para uma main recém-criada usa um atraso fixo de 300 ms após `did-finish-load`. Se a sessions-ui montar o listener mais tarde, o evento se perde (ideal: um handshake "renderer ready").
- Falha de atalho é exposta via `quick:shortcutStatus`, mas não há evento push: a UI de Settings (shell) deve chamar o canal depois de `settings:set`.

## Pedidos pendentes
Ver `docs/requests/mcp-quick.md`: pontos de integração para shell, sessions-ui e sessions-core. O pedido 1 (`quick:shortcutStatus`) foi atendido e implementado.

---

# Fase 2

## O que foi feito
### Main (`src/main/mcp/`)
| Arquivo | Conteúdo |
|---|---|
| `archive.ts` (novo) | Extração de zip com `/usr/bin/ditto -x -k --norsrc` em `userData/staging/<uuid>` (sempre removido no `finally`). Remove `__MACOSX` e rejeita arquivos com symlink. `assertFile` checa extensão e tamanho; `slugify`. |
| `extensions.ts` (novo) | Manifest validado com zod (`manifest_version`/`dxt_version` 0.1–0.4, `server.type` node\|python\|binary\|uv, `mcp_config` + `platform_overrides`, `user_config`, `compatibility`, `tools`, `icon`). Compatibilidade: plataforma + runtime no PATH do shell (`node`/`python3`/`uv --version`) com checagem de faixa semver simples (`>=`, `>`, `<`, `^`, `~`, `\|\|`). Preview sem instalar. Install: id `local.mcpb.<slug>` → `userData/extensions/<id>`; settings `{enabled,userConfig}` em `userData/extensions-settings/<id>.json`. Campos `sensitive` cifrados com `safeStorage` (`__encrypted__:<b64>`) e devolvidos ao renderer como `••••••`; reenviar a máscara mantém o segredo. Reinstalar/atualizar mantém enabled e config. Substituições: `${__dirname}`, `${user_config.X}` (arg que é só `${user_config.X}` com valor `multiple` vira vários args), `${HOME}`, `${/}`, `${pathSeparator}`. Sem `mcp_config`, deriva o comando de `server.type` + `entry_point`. Comandos simples (`node`, `python3`…) são resolvidos para caminho absoluto pelo PATH do shell (sem node embutido). |
| `index.ts` | "Targets" = servidores do config + um servidor por extensão (o nome é o `name` do manifest; o config do usuário com o mesmo nome tem precedência). Probe/status/`mcp:changed` iguais para os dois. Extensão incompatível ou com config obrigatória faltando → status `failed` com o motivo e fica fora de `getEnabledMcpServers()`. Handlers `ext:*` (emitem `ext:changed` + `mcp:changed` + bus `mcp:config-changed`), `ext:pickFile` (dialog filtrado mcpb/dxt), `ext:openFolder`, `skills:*`. `mcp:reload` também recarrega as extensões. |
| `skills.ts` | `create` (`<scope>/skills/<slug>/SKILL.md`, frontmatter `name: <slug>` + `description` em string YAML segura), `read` (user/project + plugins, só leitura), `save`/`delete` só aceitam `<abs>/.claude/skills/<nome>/SKILL.md` normalizado (sem `..`), fora de `~/.claude/plugins`. Pasta de skill que é symlink: só o link é removido. `installArchive`: `.skill`/`.zip` ≤ 30 MB, exatamente 1 `SKILL.md`, rejeita `hooks`, `commands`, `agents`, `.mcp.json`, `hooks.json`, `.claude-plugin` e symlinks; instala em `~/.claude/skills/<slug>` (erro se já existir). O parse de frontmatter agora decodifica strings entre aspas duplas (escapes JSON). |

### Renderer (`features/mcp/`)
- `ExtensionsSettings.tsx`: lista com ícone, nome, versão, autor, descrição, toggle, status do MCP (+ motivo/erro) e tools (as do probe ou, sem probe, as do manifest). Configure abre um modal, Remove pede confirmação inline. Botões "Install extension…" (pick → preview → dialog) e "Open extensions folder".
- `ExtensionsHost.tsx`: ouve `ext:openRequested` (preview → dialog de instalação; erro → modal) e `skills:openRequested` (dialog de instalação de skill).
- `InstallExtensionDialog.tsx`: nome, autor, versão, descrição, aviso de update ("settings are kept"), motivo de incompatibilidade (bloqueia o Install), tools, formulário `user_config` (Install desabilitado até os campos obrigatórios estarem preenchidos), aviso de confiança.
- `UserConfigForm.tsx`: string/number/boolean/directory/file. `directory`/`file` usam `app:pickFolder`/`app:pickFiles` e aceitam `multiple` (lista com adicionar/remover); `sensitive` vira campo de senha; o default aparece como placeholder e só é aplicado em runtime.
- `SkillsSettings.tsx` + `SkillEditor.tsx` + `InstallSkillDialog.tsx`: "New skill" (nome, Personal/This project, descrição, corpo Markdown), editor mono grande (⌘S salva; skills de plugin abrem só para leitura), Delete com confirmação, "Install from file…" (`.skill`/`.zip`), revelar no Finder.
- `Modal.tsx`: modal simples (Esc em fase de captura, clique fora fecha).

## Verificado (script Node + jiti + mock de `electron`, HOME falso no scratchpad)
- Preview de um `.mcpb` real (zip): compat OK, id `local.mcpb.demo-ext`, campos do schema.
- Install sem o campo obrigatório → "Missing required settings: API key". Com config: segredo salvo como `__encrypted__:…`, renderer recebe `••••••`.
- Servidor da extensão resolvido: `node` vira caminho absoluto, `${__dirname}`, `${HOME}` e `multiple` expandidos em args, env com o segredo decifrado. O probe conectou ("Connected, 1 tool"); o server recebeu os args e a env corretos.
- `setConfig` com a máscara mantém o segredo. `satisfies` cobre `>=`, `^` e versão abaixo da faixa.
- Skills: create/read/save/delete OK. Bloqueados: `..`, `/etc/passwd` e skill de plugin. Archive válido instalado; archive com `hooks/` rejeitado; duplicado rejeitado; skill de projeto criada e listada.
- `npm run typecheck`: meus arquivos limpos. `npx electron-vite build`: OK.

## Como testar manualmente
1. Baixe um `.mcpb` (ex.: dos exemplos do repo `anthropics/mcpb`) e dê duplo clique ou use Settings › Extensions › "Install extension…". Preencha o config → Install → status "Connected" e tools.
2. Toggle off → "Disabled"; Configure → o campo sensível mostra `••••••`; salvar sem mexer mantém o valor.
3. Numa sessão nova, as tools da extensão aparecem (`mcp__<name>__*`).
4. Settings › Skills → New skill → aparece em Personal; edite, ⌘S, delete. "Install from file…" com um `.skill`.

## Limitações / TODOs
- Sem verificação de assinatura, auto-update, `local.unpacked` (instalar pasta) ou Extensions Directory.
- Faixa semver é uma implementação mínima (sem pré-release nem hífen `1.0 - 2.0`); faixa desconhecida passa.
- `compatibility.claude_desktop` é ignorado.
- O status de uma extensão é procurado pelo `name` do manifest. Se o usuário tiver um servidor com o mesmo nome, a linha da extensão mostra o status desse servidor (que tem precedência) e não o da extensão.
- O dialog de instalação de skill mostra só o nome do arquivo antes de instalar (não existe canal de preview). Nome e descrição aparecem depois da instalação.
- Skills não emitem evento de mudança; a lista recarrega após cada ação e no botão Refresh.

## Pedidos pendentes
- `docs/requests/mcp-quick.md` §3: canal `skills:previewArchive` (opcional).
