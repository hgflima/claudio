# Pedidos do agente `mcp-quick`

## 1. ✅ ATENDIDO — Feedback de falha ao registrar o atalho global (`quick:shortcutStatus` implementado em `src/main/mcp/quick.ts`)
**O quê:** expor o resultado do registro do atalho do Quick Entry para a UI de Settings (shell) mostrar "Shortcut is invalid / already in use" (SH-05 do recon).
**Por quê:** hoje `registerQuickEntry()` só loga (`[quick] global shortcut ... is taken` / `invalid`). O usuário não sabe que o atalho falhou.
**Diff sugerido** (`src/shared/contracts/mcp.ts`):
```diff
 export interface McpInvoke {
+  'quick:shortcutStatus': () => { accelerator: string; registered: boolean; error?: 'invalid-accelerator' | 'registration-failed' }
```
Eu implemento o handler em `src/main/mcp/quick.ts` assim que o canal existir.

## 2. Integrações que dependem de outros agentes (sem mudança de contrato)
- **shell**: `SettingsDialog` deve renderizar `<McpSettings />` e `<SkillsSettings cwd={cwdDaSessaoAtiva} />` (de `@/features/mcp/...`). O `cwd` é opcional; sem ele, as skills de projeto não aparecem.
- **shell (Settings)**: depois de `settings:set({ quickEntryShortcut })`, chame `api.invoke('quick:shortcutStatus')` para mostrar erro de atalho inválido/em uso.
- **shell (tray)**: para "clique no ícone abre o Quick Entry", importe `toggleQuickEntry` (ou `showQuickEntry`) de `src/main/mcp/quick.ts`.
- **sessions-ui**: ouvir `api.on('quick:submitted', ({ text, attachments, cwd }) => …)` na janela principal e criar uma sessão (`cwd` null = chat).
- **sessions-core**: chamar `getEnabledMcpServers()` em cada sessão nova; opcionalmente `bus.onBus('mcp:config-changed', …)`.

## 3. (Opcional, Fase 2) Preview de skill antes de instalar
**O quê:** `'skills:previewArchive': (filePath: string) => { name: string; description: string; files: number }` em `McpInvoke`.
**Por quê:** o briefing pede "preview do SKILL.md (nome/descrição) → Install", mas só existe `skills:installArchive`. Hoje o dialog mostra só o nome do arquivo antes e os dados da skill depois de instalar.
**Implementação:** eu faço em `skills.ts` (mesma validação do install, sem mover nada) e ligo no `InstallSkillDialog`.
