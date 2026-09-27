# clawd-mini

Mascote de desktop que reage ao que o Claude Code está fazendo (CLI e Claude Desktop).
Só animação: sem rede, sem porta, sem permissões, sem ler transcript. Detalhes em [SPEC.md](SPEC.md).

## Instalar

```bash
npm install
npm start
```

Se o `npm start` reclamar que o Electron não está instalado, o postinstall dele não rodou:
`node node_modules/electron/install.js`.

Os SVGs já estão em `themes/clawd/`. Para reimportar de um clone do clawd-on-desk:
`npm run import-assets -- <clone>`.

## Registrar os hooks (uma vez, na mão)

```bash
npm run print-hooks
```

Cole o conteúdo de `"hooks"` em `~/.claude/settings.json`. O app nunca edita esse arquivo.
O comando usa o caminho absoluto do `node` atual; se você trocar de versão no nvm e ela sumir, rode de novo.

Para desinstalar: apague essas entradas do `settings.json`, rode `npm run uninstall-autostart`
e apague `~/.clawd-mini/`.

## Autostart

```bash
npm run build
npm run install-autostart
```

## Desenvolvimento

```bash
npm test                  # testes (node:test)
./scripts/simulate.sh     # percorre todos os eventos com o app aberto; PAUSE=1 para acelerar
```

`CLAWD_MINI_HOME=<dir>` troca `~/.clawd-mini` por outro diretório (hook, app e simulador).

## Problemas conhecidos

- **Fundo preto em vez de transparente:** crie a janela com atraso, `setTimeout(start, 300)` em `src/main/main.ts`. Não foi preciso no GNOME/X11.
- **Sem ícone na barra:** no GNOME o tray exige a extensão AppIndicator. O pet funciona sem ela.
- **Xorg e Wayland:** funciona nos dois. O launcher força XWayland (`--ozone-platform=x11`) quando há `$DISPLAY`; em Xorg isso não muda nada. Em Wayland sem XWayland o pet abre, mas não consegue se posicionar nem ficar por cima, e avisa no log e no tooltip do tray.
- **Escala fracionária no XWayland (125%, 150%):** pode deixar o sprite borrado ou o arraste levemente deslocado.

## Licença dos sprites

Os SVGs em `themes/clawd/` e `assets/tray.png` são arte de rullerzhou-afk (clawd-on-desk), usados com permissão
para fins **não comerciais**. Veja [themes/clawd/NOTICE.md](themes/clawd/NOTICE.md).
Clawd character is the property of Anthropic.
