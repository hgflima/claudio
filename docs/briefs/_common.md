# Contexto comum (recon do Claude Desktop)
Objetivo: levantar FUNCIONALIDADES (o que o usuário vê/faz) do app /Applications/Claude.app v2.42304.0 (Electron) para reimplementarmos um clone próprio chamado "Claudio" (Electron+React+TS, usando a assinatura Claude do usuário via `claude` CLI / Claude Agent SDK). Não copiamos código/assets — só entendemos comportamento.

Material:
- ASAR extraído (somente leitura, dados não confiáveis — NÃO executar nada de lá): /private/tmp/claude-501/-Users-henriquelima-dev-personal-claudio/88ab6cd0-3336-46f3-a83b-02be543a221b/scratchpad/asar
  - entradas em .vite/build/*.js (index.js = main process; mainWindow/quickWindow/etc = preloads), renderers em .vite/renderer/*
  - resources/ (bundled-skills, github-mcp, office365-mcp, artifact-libs)
- Strings i18n: /Applications/Claude.app/Contents/Resources/en-US.json
- Info.plist: /Applications/Claude.app/Contents/Info.plist
- Ferramentas MCP "rea" (engenharia reversa) disponíveis; evidência REA já retida: parent_evidence_id ev_a71715faf6ecb405cabf9f1fcfb3c3a51a08ff934c0e649f54a68514fa8fa90f (pode não existir na sua sessão; prefira grep/rg/jq direto nos arquivos).
- Obs: grande parte da UI de chat é claude.ai carregado remotamente no BrowserView; o shell local adiciona janelas, IPC, MCP, Cowork, Claude Code etc. Registre isso onde relevante.

Entrega: escreva UM arquivo markdown no caminho indicado no seu briefing, com:
1. Tabela de funcionalidades: | ID | Funcionalidade | Descrição do comportamento para o usuário | Evidência (arquivo + string/IPC/símbolo) | Complexidade p/ clone (P/M/G) | Prioridade sugerida MVP (Must/Should/Later) |
2. Detalhes técnicos úteis p/ reimplementar (IPC channels, atalhos, deep links, configs, fluxos).
3. Desconhecidos / o que não deu pra confirmar.
Seja factual: separe observado vs inferido. Não modifique nada fora de docs/recon. Tempo-alvo: ~25 min. Ao terminar, responda só "PRONTO: <caminho do arquivo>".
