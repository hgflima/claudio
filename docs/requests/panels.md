# Pedidos do agente `panels`

## 1. (baixa prioridade) chmod do spawn-helper do node-pty no postinstall
**O quê:** `node_modules/node-pty/prebuilds/<plat>-<arch>/spawn-helper` foi instalado sem bit de execução (`-rw-r--r--`) → `posix_spawnp failed` ao abrir terminal.
**Contorno atual:** `src/main/workspace/terminal.ts` faz `chmod 755` em runtime no `registerWorkspace()` (já aplicado no ambiente de dev durante o teste). Funciona em dev; no app empacotado o `asarUnpack` já cobre node-pty, mas o diretório do bundle pode ser read-only.
**Diff sugerido (package.json):**
```diff
-    "postinstall": "electron-builder install-app-deps",
+    "postinstall": "electron-builder install-app-deps && chmod +x node_modules/node-pty/prebuilds/*/spawn-helper 2>/dev/null || true",
```
