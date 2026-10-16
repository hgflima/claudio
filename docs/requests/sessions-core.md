# Pedidos do agente sessions-core

## 1. Fechar processos `claude` ao sair (main/app — orquestrador/shell)
**O quê:** chamar `stopAllSessions()` (exportado de `src/main/sessions/index.ts`) no fluxo de quit, depois da confirmação de "sessões rodando".
**Por quê:** cada sessão mantém um processo `claude` vivo (streaming input). Sem isso, processos podem ficar órfãos se o Electron sair rápido.
```ts
// src/main/app/index.ts (ou src/main/index.ts)
import { stopAllSessions } from '../sessions'
app.on('will-quit', () => stopAllSessions())
```

## 2. (Opcional) Contrato: campo `titleSource`
Hoje guardo `titleSource: 'auto' | 'user'` só no arquivo de meta (fora do contrato) e removo antes de enviar ao renderer. Se a UI quiser saber se o título foi renomeado, adicionar `titleSource?: 'auto' | 'user'` em `SessionMeta`. Não bloqueia nada.
