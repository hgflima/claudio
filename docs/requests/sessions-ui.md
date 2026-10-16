# Pedidos — sessions-ui

## (Fase 2) CSP herdada pelos widgets `mcp__visualize__show_widget` — verificar no GUI
O widget é renderizado em `<iframe sandbox="allow-scripts" srcdoc=…>` (`features/sessions/tools/WidgetCard.tsx`), com a CSP própria em `<meta>`.
**Risco:** pela spec, documentos `srcdoc` herdam a policy container (CSP) da página que os cria. A CSP de `src/renderer/index.html` tem `script-src 'self'`, então os `<script>` inline do widget (e o script que reporta a altura) podem ser bloqueados. As duas CSPs se somam, e a mais restritiva vence.
**Como verificar:** peça um widget com JS (ex.: um contador com botão). Se o console mostrar "Refused to execute inline script", a herança está acontecendo.
**Mitigação já feita:** sem mensagem de altura em 1,5s, o iframe fica com 360px fixos. HTML e CSS continuam funcionando.
**Correção sugerida (orquestrador/shell):** servir o widget por um protocolo próprio isolado, por exemplo `protocol.handle('claudio-widget', …)`, que devolve o HTML (passado via query/id) com o header `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:`, e adicionar `claudio-widget:` em `frame-src` no index.html. Depois disso, basta eu trocar `srcDoc` por `src`.

**Status:** resolvido pelo orquestrador (canal `widget:create` + protocolo `claudio-widget://`); WidgetCard já migrado.
