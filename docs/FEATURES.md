# Claudio — Inventário de funcionalidades (baseado no Claude Desktop v2.42304.0)

Fontes: `docs/recon/{shell,code,mcp,strings}.md` (engenharia reversa via REA + leitura do ASAR, sem execução).

## Achado-chave
O Claude Desktop é um **shell Electron fino**: a UI de Chat/Code/Cowork/Settings é o **claude.ai remoto** dentro de um `WebContentsView`. O ASAR contém só o backend local (IPC, sessões Claude Code via `@anthropic-ai/claude-agent-sdk`, pty, git, MCP, janelas nativas).
➡️ O Claudio precisa construir **toda a UI em React** localmente. O backend de IA = Claude Agent SDK usando o login/assinatura do `claude` CLI.
➡️ "Chat" puro do claude.ai (projetos, memória web, artifacts web) não é acessível pela assinatura via SDK; no Claudio o modo Chat = sessão do SDK sem ferramentas de código.

## Inventário completo (agrupado)

| Grupo | Funcionalidades | Fase |
|---|---|---|
| Shell | Janela frameless + title bar, tray/menu bar, menu nativo completo + atalhos, tema, zoom, fullscreen, single-instance, fechar≠sair, links externos no browser, tela de erro | **MVP** |
| Auth | Detectar login do `claude` CLI; orientar `claude /login` | **MVP** |
| Sessões Code | Escolher pasta + trust, streaming, fila de mensagens, interromper, modelo/effort, modos de permissão (default/acceptEdits/plan/bypass/auto), card de permissão (once/session/always) | **MVP** |
| Chat | Conversa sem ferramentas de código, com anexos de imagem | **MVP** |
| Histórico | Sidebar de sessões, renomear/arquivar/deletar, retomar (resume), busca em transcrições, importar sessões do CLI (`~/.claude/projects`) | **MVP** (busca/import: Should) |
| Painéis IDE | Terminal (node-pty), Changes/diff git | **MVP** |
| Composer | @-menção de arquivos (fuzzy), menu `/` (slash commands + skills), colar imagens | **MVP** |
| MCP | `mcpServers` em config JSON, status por servidor, reload, logs, importar do `claude_desktop_config.json` | **MVP** |
| Quick Entry | Janela flutuante com atalho global (Alt+Space), envia para nova sessão | **MVP** |
| Notificações | "Needs input"/terminou, níveis por tipo, aviso ao sair com sessões rodando | **MVP** |
| Settings | Tela de preferências (atalho, notificações, tema, modelo padrão, permissão padrão, menu bar, abrir no login) | **MVP** |
| Infra | Resolver PATH/env do shell de login (shell-path-worker) | **MVP** |
| Produtividade | Command palette (⌘K), find in page, split view, side chat, fork/clear/rewind, uso de contexto, sugestão de próximo prompt, open in editor | Fase 2 |
| Git | Worktrees por sessão (`.claude/worktrees`, branch `claude/*`), troca de branch segura, integração PR via `gh` | Fase 2 |
| Automação | Tarefas agendadas (cron/one-shot) + MCP `scheduled-tasks`, keep-awake | Fase 2 |
| Extensibilidade | Extensões `.mcpb/.dxt` (instalar, user_config, segredos no Keychain), Skills UI (CRUD, `.skill`), deep links `claudio://` | Fase 2 |
| Visual | Inline visualizations (widget SVG/HTML sandbox), live artifacts com libs offline, preview de dev server | Fase 2 |
| Plataforma | Auto-update (electron-updater), troubleshooting (logs, reset, cache), uso do plano no tray (se API disponível) | Fase 2 |
| Avançado | Cowork em VM, Computer use, Claude in Chrome, iOS/Android simulator, SSH remoto, Remote Control/Teleport, ditado, Quick Write, Hardware Buddy, Design window, MDM/org, inferência 3P | Later / fora do escopo |

## Stack do MVP
Electron + React + TypeScript (electron-vite), Tailwind + shadcn/ui, Zustand, `@anthropic-ai/claude-agent-sdk`, `node-pty` + xterm.js, `simple-git`/git CLI, zod, electron-builder.
