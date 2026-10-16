# Claudio — Regras do time (LEIA INTEIRO)

Você é um dos 5 agentes construindo o **Claudio** em paralelo: clone pessoal do Claude Desktop (Electron 44 + React 19 + TS + Tailwind v4 + Zustand), cuja IA roda via **@anthropic-ai/claude-agent-sdk** usando o login/assinatura do `claude` CLI do usuário (NUNCA API key).
Contexto do produto: `docs/FEATURES.md` e os relatórios de engenharia reversa em `docs/recon/*.md` (comportamento do app original — use como referência de UX).

## Arquitetura (já existe, não reestruture)
- `src/shared/contracts/*.ts` + `src/shared/ipc.ts` — **contrato IPC tipado, fonte única**. Leia o contrato do seu domínio antes de tudo.
- `src/preload/index.ts` — bridge genérica `window.claudio.invoke(channel, ...args)` / `.on(event, cb)`. No renderer use `import { api } from '@/lib/api'`.
- Main: registre handlers com `handle(channel, fn)` e emita com `emit(event, payload)` / `emitTo(wc, …)` de `src/main/core/ipc.ts`.
- `src/main/core/`: `settings.ts` (getSettings/setSettings/settingsEvents/addRecentFolder), `shellEnv.ts` (getShellEnv/resolveClaudePath — SEMPRE use o env do shell para spawnar processos), `store.ts` (dataPath/readJson/writeJson), `log.ts`, `bus.ts` (eventos entre módulos do main).
- Renderer: `src/renderer/src/App.tsx` (layout), `stores/ui.ts` (estado global de UI), `stores/commands.ts` (barramento de comandos de menu), `lib/cn.ts`, tokens de cor em `index.css` (use `bg-bg`, `bg-bg-sidebar`, `bg-bg-elevated`, `bg-bg-hover`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `border-border`, `bg-accent`, `text-accent`, `bg-code-bg`, `font-serif` p/ texto do assistente, `font-mono`). Ícones: `lucide-react`. Dark mode = `data-theme="dark"` no `<html>`.

## Regras de propriedade (críticas — 5 agentes no mesmo diretório)
1. **Edite apenas arquivos dos SEUS caminhos** (listados no seu briefing). Pode criar arquivos novos dentro deles.
2. Arquivos do orquestrador (NÃO editar): `src/shared/**`, `src/preload/**`, `src/main/core/**`, `src/main/index.ts`, `src/renderer/src/{App.tsx,main.tsx,quick.tsx,index.css,lib/*,stores/*}`, `package.json`, configs. Precisa mudar algo neles (ex.: um campo novo no contrato)? Escreva o pedido em `docs/requests/<seu-agente>.md` (o quê + por quê + diff sugerido), contorne localmente se possível e siga.
3. **NÃO rode `npm install`/`npm i`** nem mexa no lockfile. Dependências já instaladas: react-markdown, remark-gfm, rehype-highlight, highlight.js, lucide-react, clsx, tailwind-merge, zustand, zod, diff, fuse.js, @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links, node-pty, @anthropic-ai/claude-agent-sdk, @modelcontextprotocol/sdk. Precisa de outra? pedido em `docs/requests/`.
4. **NÃO rode o app (`npm run dev`/electron)** — o orquestrador faz a integração e os testes de GUI. Você pode: `npm run typecheck`, `npx electron-vite build`, e scripts Node de teste no seu scratchpad.
5. Erros de typecheck em arquivos de OUTRO agente: ignore (ele está trabalhando). Os SEUS arquivos devem passar.
6. Não faça git commit.

## Qualidade
- Código TypeScript estrito, sem `any` desnecessário, componentes pequenos, sem comentários óbvios.
- UI em inglês (como o Claude Desktop), visual limpo/quente estilo Claude: muito respiro, cantos arredondados (rounded-lg/xl), bordas sutis, sem cores berrantes.
- Main process: valide entradas de IPC (zod quando fizer sentido), nunca confie em paths do renderer sem checar.

## Entrega
Quando terminar: rode `npm run typecheck` (seus arquivos limpos) e escreva `docs/build/report-<seu-agente>.md` com: o que foi feito, como testar manualmente, limitações/TODOs, pedidos pendentes. Responda só "PRONTO".
