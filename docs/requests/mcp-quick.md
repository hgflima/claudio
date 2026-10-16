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
