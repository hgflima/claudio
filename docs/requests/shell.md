# Pedidos do agente `shell`

## 1. `AppInfo.logsPath` (contrato `src/shared/contracts/app.ts`)
**Por quê:** no macOS `app.getPath('logs')` é `~/Library/Logs/Claudio`, fora de `userDataPath`; a aba About precisa abrir a pasta de logs.
**Contorno atual:** `app:getInfo` já devolve `logsPath` extra (tipado como `AppInfo & { logsPath: string }`), e `AboutTab` lê como campo opcional.
**Diff sugerido:**
```diff
 export interface AppInfo {
   version: string
   platform: string
   claudePath: string | null
   claudeVersion: string | null
   userDataPath: string
+  logsPath: string
 }
```
Depois disso, remover a interseção em `src/main/app/index.ts` e `features/settings/tabs/AboutTab.tsx`.

## 2. (Opcional) Atalho de Quick Entry no tray
O item "Quick Entry" do tray hoje só mostra a janela principal (conforme briefing). Se `mcp/quick.ts` exportar `showQuickEntry()`, basta trocar o `click` em `src/main/app/tray.ts`.

## Nota (rodada 3) — Esc no SettingsDialog
A causa estava no xterm (ele cancela o Esc) e no foco atrás do modal, não no sessions-ui. Já corrigi do meu lado, então não há pedido. Uma sugestão opcional ao sessions-ui: `ui/Dialog` e `ui/Popover` poderiam ignorar o Esc quando `e.defaultPrevented`, para não fechar duas camadas de uma vez se algum dia ficarem empilhados.
