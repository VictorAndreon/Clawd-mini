# clawd-mini

Mascote de desktop que reage ao que o Claude Code está fazendo (CLI e Claude Desktop).
Só animação: sem rede, sem porta, sem permissões, sem ler transcript. Detalhes em [SPEC.md](SPEC.md).

## Como funciona (em 10 segundos)

```
Claude Code ──hook──▶ hook/hook.js ──grava──▶ ~/.clawd-mini/sessions/<id>.json ──fs.watch──▶ app Electron (pet)
```

O Claude Code chama `hook/hook.js` a cada evento, o hook grava um arquivo pequeno e o app
observa essa pasta. Por isso a instalação tem duas partes: **rodar o app** e **registrar os hooks**
no Claude Code. Sem os hooks, o pet abre mas fica parado dormindo.

## Requisitos

- **Linux** com X11 ou Wayland + XWayland (testado no GNOME).
- **Node.js 22+** e npm. Funciona com nvm.
- **git**.
- **Claude Code** (CLI ou Claude Desktop) já instalado.
- Opcional, no GNOME: extensão **AppIndicator** para aparecer o ícone na barra.

## Instalação

### 1. Clonar e instalar as dependências

```bash
git clone https://github.com/VictorAndreon/Clawd-mini.git
cd Clawd-mini
npm install
```

O `npm install` baixa o Electron (~100 MB). Se depois o app reclamar que o Electron não está
instalado, o postinstall dele não rodou. Rode na mão:

```bash
node node_modules/electron/install.js
```

### 2. Abrir o pet

```bash
npm start
```

Compila o TypeScript para `dist/` e abre o pet no canto da tela. Deixe aberto e siga para o
próximo passo.

### 3. Registrar os hooks no Claude Code (uma vez, na mão)

O app **nunca** edita seu `~/.claude/settings.json`. Você cola os hooks uma vez:

```bash
npm run print-hooks
```

Isso imprime um JSON assim (com os seus caminhos):

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "'/caminho/do/node' '/caminho/do/Clawd-mini/hook/hook.js' SessionStart", "async": true, "timeout": 3 }] }
    ],
    "...": "um bloco por evento"
  }
}
```

Abra `~/.claude/settings.json` e coloque o conteúdo de `"hooks"` lá dentro:

- **Não tem `"hooks"` ainda?** Adicione a chave `"hooks"` inteira no objeto de nível raiz.
- **Já tem `"hooks"`?** Mescle evento por evento. Se um evento (ex.: `Stop`) já tiver entradas,
  acrescente o item novo no array, não substitua o que existe.

Dica: salve uma cópia antes (`cp ~/.claude/settings.json ~/.claude/settings.json.bak`) e confira
se o JSON continua válido (`node -e 'require(process.env.HOME + "/.claude/settings.json")'`).

> **Por que caminho absoluto do node?** O Claude Desktop não carrega o nvm do seu shell, então
> `node` puro pode não existir para ele. Se você trocar de versão no nvm e apagar a antiga,
> rode `npm run print-hooks` de novo e atualize os caminhos.

### 4. Testar

Abra uma sessão nova do Claude Code (os hooks são lidos na inicialização) e mande qualquer
prompt. O pet deve sair do sono e começar a "trabalhar".

Quer testar sem o Claude? Com o app aberto:

```bash
npm run simulate
```

Isso percorre todos os eventos. `PAUSE=1 npm run simulate` acelera.

### 5. (Opcional) Abrir junto com o login

```bash
npm run build
npm run install-autostart
```

Cria `~/.config/autostart/clawd-mini.desktop`. O autostart não compila nada, então depois de
um `git pull` rode `npm run build` de novo. Ele também usa o caminho absoluto do `node` atual:
se esse node sumir, o autostart falha em silêncio. Rode `npm run install-autostart` de novo.

## Atualizar

```bash
git pull
npm install
npm run build
```

Se o caminho do repo ou do node mudou, refaça o passo 3 (hooks) e o passo 5 (autostart).

## Desinstalar

1. Apague as entradas do clawd-mini em `~/.claude/settings.json` (as que apontam para `hook/hook.js`).
2. `npm run uninstall-autostart`
3. `rm -rf ~/.clawd-mini`
4. Apague a pasta do repo.

## Desenvolvimento

```bash
npm test                  # build + testes (node:test)
npm run simulate          # percorre todos os eventos com o app aberto; PAUSE=1 para acelerar
```

`CLAWD_MINI_HOME=<dir>` troca `~/.clawd-mini` por outro diretório (hook, app e simulador).

Os SVGs já estão em `themes/clawd/`. Para reimportar de um clone do clawd-on-desk:
`npm run import-assets -- <clone>`.

## Problemas conhecidos

- **Pet parado dormindo:** os hooks não estão registrados ou a sessão do Claude foi aberta antes
  de colá-los. Confira o passo 3 e abra uma sessão nova. `ls ~/.clawd-mini/sessions/` deve ganhar
  arquivos quando você manda um prompt.
- **`dist/ não existe`:** rode `npm run build` (ou `npm start`, que já compila).
- **Fundo preto em vez de transparente:** crie a janela com atraso, `setTimeout(start, 300)` em `src/main/main.ts`. Não foi preciso no GNOME/X11.
- **Sem ícone na barra:** no GNOME o tray exige a extensão AppIndicator. O pet funciona sem ela.
- **Xorg e Wayland:** funciona nos dois. O launcher força XWayland (`--ozone-platform=x11`) quando há `$DISPLAY`; em Xorg isso não muda nada. Em Wayland sem XWayland o pet abre, mas não consegue se posicionar nem ficar por cima, e avisa no log e no tooltip do tray.
- **Escala fracionária no XWayland (125%, 150%):** pode deixar o sprite borrado ou o arraste levemente deslocado.

## Licença dos sprites

Os SVGs em `themes/clawd/` e `assets/tray.png` são arte de rullerzhou-afk (clawd-on-desk), usados com permissão
para fins **não comerciais**. Veja [themes/clawd/NOTICE.md](themes/clawd/NOTICE.md).
Clawd character is the property of Anthropic.
