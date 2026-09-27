# clawd-mini — Spec

Mascote de desktop que reage ao que o Claude Code está fazendo. Só animação: nada de permissão, rede ou leitura de transcript.

- **Status:** rascunho
- **Data:** 2026-09-25
- **Referência:** [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) (AGPL-3.0). Serve como estudo de comportamento; nenhum código é copiado dele. Os sprites SVG vêm de lá, com permissão do autor para uso não comercial (ver seção 5).

---

## 1. Objetivo

Um pet pixelado fica num canto da tela e mostra o estado das sessões do Claude Code (CLI ou Claude Desktop): pensando, trabalhando, esperando você, terminou, dormindo.

### Não-objetivos (v1)

Ficam fora de propósito, porque cada item abaixo é uma superfície de risco que o clawd-on-desk tem e este projeto não quer:

- Aprovar ou negar permissões (sem hook `PermissionRequest`).
- Ler transcript, prompt, resposta do modelo ou conteúdo de arquivo.
- Servidor HTTP ou qualquer porta escutando.
- Rede de qualquer tipo (auto-update, Telegram/Slack, telemetria, PWA).
- Escrever no `~/.claude/settings.json` sozinho. O usuário cola os hooks uma vez, na mão.
- Suporte a outros agentes (Codex, Gemini, Cursor…).
- Pular para o terminal da sessão.

---

## 2. Arquitetura

```
Claude Code ──(hook, stdin JSON)──▶ hook.js ──(escreve arquivo)──▶ ~/.clawd-mini/sessions/<session_id>.json
                                                                           │
                                                          fs.watch         ▼
                                                   Electron main ──IPC──▶ renderer (sprite)
```

Três peças:

| Peça | O que é | Tamanho estimado |
|---|---|---|
| `hook/hook.js` | Script Node sem dependências, chamado pelo Claude Code em cada evento | ~60 linhas |
| `src/main/` | Processo main do Electron: janela, watcher, máquina de estados, tray | ~300 linhas |
| `src/renderer/` | Página que desenha o sprite e toca a animação | ~150 linhas |

### Por que arquivo e não HTTP

O clawd-on-desk usa um servidor HTTP em `127.0.0.1` **sem autenticação**. Qualquer processo do usuário consegue mandar um estado falso para ele.

Com arquivo:

- não há porta aberta;
- não há o que autenticar;
- o hook nunca espera o app (se o app estiver fechado, o hook só grava e sai);
- o estado sobrevive a um restart do app.

---

## 3. Hook (`hook/hook.js`)

### Contrato

- É chamado como `<node> /caminho/hook.js <Evento>`.
- Lê o JSON do stdin com timeout de 1 s. Se o stdin não chegar, sai com código 0.
- **Nunca escreve no stdout.** Sai sempre com código 0 e nunca bloqueia nem altera o Claude.
- Escrita atômica: grava em `<arquivo>.tmp` e depois faz `rename`.
- Compatível com Node ≥ 12: CommonJS, sem optional chaining, sem dependências. O node padrão desta máquina já foi v12, e o hook não deve depender de qual `node` está no PATH.

### O que é gravado

Arquivo `~/.clawd-mini/sessions/<session_id>.json` (diretório com modo 0700, arquivo com modo 0600):

```json
{
  "sessionId": "abc123",
  "state": "working",
  "event": "PreToolUse",
  "tool": "Bash",
  "project": "efesus",
  "updatedAt": 1790000000000
}
```

- `project` é só o `basename(cwd)`, nunca o caminho completo.
- `tool` só existe em Pre/PostToolUse. Serve para escolher entre as variantes `typing` e `building`.
- **Nada** de prompt, `tool_input`, `tool_response` ou `transcript_path`.
- Em `SessionEnd`, o arquivo é apagado.

### Mapa evento → estado

| Evento do Claude Code | Estado | Observação |
|---|---|---|
| `SessionStart` | `idle` | |
| `UserPromptSubmit` | `thinking` | |
| `PreToolUse` | `working` | `tool` ∈ {Edit, Write, MultiEdit, NotebookEdit} → variante `typing`; Bash → `building`; o resto → `working` |
| `PostToolUse` | `thinking` | Entre uma ferramenta e outra o Claude volta a pensar |
| `PostToolUseFailure` | `error` | One-shot |
| `SubagentStart` | `juggling` | O contador de subagentes fica no arquivo |
| `SubagentStop` | volta ao estado anterior | Decrementa o contador |
| `PreCompact` | `sweeping` | One-shot |
| `Notification` | `attention` | **O Claude precisa de você** (permissão ou input). É o estado mais útil |
| `Stop` | `done` | One-shot e depois `idle` |
| `SessionEnd` | apaga o arquivo | |

> **A confirmar:** conferir na doc de hooks da versão instalada (`claude --version`) se existem `SubagentStart`, `PostToolUseFailure` e `PreCompact`. O clawd-on-desk condiciona alguns eventos à versão. Se algum não existir, o hook apenas nunca é chamado para ele e nada quebra.

### Registro manual dos hooks

`npm run print-hooks` imprime o bloco JSON com os caminhos absolutos já resolvidos, para o usuário colar em `~/.claude/settings.json`. Cada evento fica assim:

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "/home/veplex/.nvm/versions/node/v20.20.2/bin/node /home/veplex/Documentos/clawd-mini/hook/hook.js PreToolUse",
      "async": true,
      "timeout": 3
    }
  ]
}
```

- Caminho **absoluto** do node. O desktop não carrega o nvm do shell.
- `async: true`, para o Claude não esperar o hook.
- O app **nunca** edita esse arquivo, então para desinstalar basta apagar essas entradas.

---

## 4. App Electron

### Janela do pet

Opções do `BrowserWindow`:

```ts
{
  width: 160, height: 160,
  frame: false,
  transparent: true,
  resizable: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  hasShadow: false,
  focusable: false,
  type: 'toolbar',
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload }
}
```

- **A janela tem exatamente o tamanho do sprite.** No Linux, `setIgnoreMouseEvents(true, { forward: true })` não encaminha o movimento do mouse (o `forward` só funciona no macOS e no Windows). Por isso a v1 não tem click-through: a janela é pequena, e os cantos transparentes bloquearem clique é aceitável.
- `alwaysOnTop` com o nível `'screen-saver'`, se o `'floating'` padrão ficar atrás de alguma coisa.
- **Arrastar:** manual, via `mousedown`/`mousemove` → IPC → `win.setPosition`, mostrando o sprite `drag` (detalhes na seção 5). Clique-duplo e clique-direito ficam desligados na v1.
- **Posição:** salva em `~/.clawd-mini/prefs.json` ao soltar o arraste e restaurada ao abrir. Se a posição salva cair fora de qualquer tela (monitor desconectado), volta para o canto inferior direito da tela principal.

### X11 e Wayland → XWayland

O app tem que funcionar igual em sessão **Xorg** e em sessão **Wayland** (padrão do Ubuntu). Em Xorg a flag abaixo não muda nada; em Wayland ela é necessária.

O Electron ≥ 38 roda como cliente Wayland nativo por padrão numa sessão Wayland. No Wayland o app não pode posicionar a própria janela nem forçar "sempre por cima", e isso quebra o pet.

- **O backend não pode ser trocado em runtime.** O Electron escolhe o backend Ozone em C++ antes do script main rodar. `app.commandLine.appendSwitch` no main é tarde demais. Isso foi confirmado no código do clawd-on-desk (`src/main.js`, `src/linux-ozone.js`).
- **Solução:** o launcher passa a flag direto:
  ```bash
  electron . --ozone-platform=x11
  ```
  Ela vai no `npm start` e no `.desktop` de autostart.
- **Guarda:** se `$DISPLAY` estiver vazio (Wayland sem XWayland), o launcher não passa a flag. Com `x11` e sem X server, o Chromium aborta antes do `ready`.
- **Modo degradado avisado:** se o main detectar `XDG_SESSION_TYPE=wayland` sem `$DISPLAY`, escreve um aviso no log e no tooltip do tray explicando que posição e "sempre por cima" não vão funcionar.
- **Verificação:** o checklist (seção 7) roda nos dois tipos de sessão.
- **Limitação aceita:** não há rastreio do cursor fora da própria janela, então não dá para o pet seguir o mouse com os olhos. Fica para uma v2 opcional, só em sessão Xorg.

### Watcher

- `fs.watch` em `~/.clawd-mini/sessions/`, com debounce de 50 ms.
- A cada mudança, relê todos os `*.json` (são poucos arquivos) e recalcula o estado dominante.
- Arquivo com JSON inválido (escrita pela metade) é ignorado até o próximo evento.
- Varredura de segurança a cada 10 s, porque o `fs.watch` no Linux perde evento às vezes.

### Máquina de estados

**Prioridade entre sessões** (a maior vence):

```
error 7 > attention 6 > sweeping 5 > done 4 > juggling 3 > working 2 > thinking 1 > idle 0
```

**One-shots** (`error`, `sweeping`, `done`) ficam no mínimo `minDisplayMs` na tela e depois voltam ao estado anterior da sessão:

- `done`: 4 s
- `error`: 5 s
- `sweeping`: até o próximo evento

Os tempos por estado vêm da seção 5.

**Sessão velha:**

- sem update há `staleMs` (10 min) → a sessão é ignorada no cálculo;
- sem update há 24 h → o arquivo é apagado.

Isso cobre sessões que morreram sem mandar `SessionEnd`.

**`working` preso:** se não chegar `PostToolUse` em 5 min, a sessão cai para `idle`. Uma ferramenta longa volta a ficar `working` no próximo evento.

**Sono (só com zero sessões ativas):**

| Tempo sem eventos | Estado |
|---|---|
| 60 s | `yawning` → `dozing` |
| 10 min | `collapsing` → `sleeping` |

Qualquer evento acorda o pet com a animação `waking`. A sequência completa está na seção 5.

**Transições** trocam o sprite no próximo frame, sem crossfade na v1.

### Tray

- Tray é opcional no GNOME: precisa da extensão AppIndicator. Se `new Tray()` falhar, o app segue sem tray.
- **Menu:**
  - Esconder/Mostrar
  - Não perturbe (congela em `sleeping`)
  - Resetar posição
  - Sair

### Autostart

`npm run install-autostart` cria `~/.config/autostart/clawd-mini.desktop` com `--ozone-platform=x11`. O script de desinstalação remove esse arquivo.

---

## 5. Sprites / tema

Os sprites vêm do clawd-on-desk (`assets/svg/clawd-*.svg`), **com permissão do autor (rullerzhou-afk) para uso não comercial.**

### Licença

- O `assets/LICENSE` do repo exige **permissão escrita**. Guarde a conversa em que o autor liberou, por exemplo em `themes/clawd/PERMISSION.md`, com data e link.
- Crie um `themes/clawd/NOTICE.md` com:
  - a atribuição: arte de rullerzhou-afk / clawd-on-desk, referência de pixel art de clawd-tank (@marciogranzotto);
  - a restrição: uso não comercial;
  - o aviso: "Clawd character is the property of Anthropic".
- O autor libera a arte **dele**. O personagem continua sendo da Anthropic, e o uso não comercial de fã é o mesmo status do projeto original.
- Se um dia o repo ficar público: os SVGs vão junto com o NOTICE, **nunca** num produto comercial.

### Formato dos assets

Tudo abaixo foi verificado no commit `0533435`:

- Cada estado é **um SVG animado por CSS `@keyframes` interno**. Não tem `<script>`, frames nem fps. 47 dos 49 SVGs são animados; `clawd-static-base.svg` e `clawd-idle-follow.svg` são estáticos.
- `viewBox` comum a todos: `-15 -25 45 45`.
  - O corpo ocupa só `x -4..19`, `y -3..17`.
  - O resto é margem para os efeitos que saem do corpo (bolas do malabarismo, vassoura, "zzz").
- O tamanho total dos 49 SVGs é de ~480 KB.

### Renderer

- `<img id="pet" src="themes/clawd/clawd-working-typing.svg">`. Um SVG carregado via `<img>` roda as animações CSS internas normalmente no Chromium.
- **Troca de estado:** trocar o `src`. A animação recomeça do zero, e isso é o comportamento desejado.
- **Pré-carregar** todos os SVGs do tema no boot (`new Image()`), para a troca não piscar.
- **Tamanho da janela:** 160 × 160 px por padrão, mostrando o viewBox inteiro.
  - A 160 px, o corpo fica com ~80 px.
  - Diminuir a janela cortaria os efeitos que saem do corpo.
  - O tamanho fica configurável em `prefs.json`.
- **Rastreio dos olhos:** fica fora da v1.
  - `clawd-idle-follow.svg` tem os ids `eyes-js` / `body-js` para o Clawd original mover os olhos via JS.
  - No XWayland não dá para saber onde o cursor está fora da janela, então os olhos simplesmente ficam centralizados.

### Mapa estado → SVG (`themes/clawd/theme.json`)

```json
{
  "name": "clawd",
  "viewBox": "-15 -25 45 45",
  "states": {
    "idle":       "clawd-idle-follow.svg",
    "thinking":   "clawd-working-thinking.svg",
    "working":    "clawd-working-typing.svg",
    "typing":     "clawd-working-typing.svg",
    "building":   "clawd-working-building.svg",
    "juggling":   "clawd-headphones-groove.svg",
    "juggling2":  "clawd-working-juggling.svg",
    "attention":  "clawd-notification.svg",
    "done":       "clawd-happy.svg",
    "error":      "clawd-error.svg",
    "sweeping":   "clawd-working-sweeping.svg",
    "yawning":    "clawd-idle-yawn.svg",
    "dozing":     "clawd-idle-doze.svg",
    "collapsing": "clawd-collapse-sleep.svg",
    "sleeping":   "clawd-sleeping.svg",
    "waking":     "clawd-wake.svg",
    "drag":       "clawd-react-drag.svg"
  },
  "idleVariations": [
    { "file": "clawd-idle-look.svg",    "durationMs": 6500 },
    { "file": "clawd-idle-bubble.svg",  "durationMs": 13500 },
    { "file": "clawd-idle-reading.svg", "durationMs": 14000 }
  ]
}
```

- `juggling` é para 1 subagente (fones de ouvido) e `juggling2` para 2 ou mais (malabarismo). O original faz essa mesma divisão.
- **Idle com variação:** depois de 20 s parado em `idle`, sorteia uma das `idleVariations`, toca pela `durationMs` e volta para `clawd-idle-follow.svg`.
- **Sequência de sono:**

  | Tempo sem eventos | Estado |
  |---|---|
  | 60 s | `yawning` (3 s) |
  | depois do bocejo | `dozing` |
  | 10 min | `collapsing` → `sleeping` |

  Qualquer evento → `waking` (1,5 s) → estado novo.
- **Arrastar:** enquanto arrasta, mostra `drag`; ao soltar, volta ao estado atual. O `-webkit-app-region: drag` não gera eventos de mouse para o renderer, então o arraste tem que ser manual: `mousedown`/`mousemove` → IPC → `win.setPosition`. No XWayland isso funciona, porque a posição da janela é aplicada.
- **Tempos de exibição:** vêm do `theme.json` original, que já foi calibrado para esses SVGs.

  | Estado | Tempo |
  |---|---|
  | `done` (happy) | 4 s |
  | `error` | 5 s |
  | `attention` (notification) | 5 s mínimo, depois fica em loop até a sessão mudar de estado |
  | `sweeping` | até o próximo evento |


### Copiar os assets

`scripts/import-clawd-assets.sh <caminho-do-clone>` copia só os SVGs listados no `theme.json` para `themes/clawd/`.

- Não referencie o clone direto: ele está num scratchpad temporário.
- Não copie a pasta `assets/svg/old/`, os `mini-*` nem os `react-*`, exceto o `drag`.

---

## 6. Estrutura de pastas

```
clawd-mini/
├── SPEC.md
├── package.json
├── tsconfig.json
├── hook/
│   └── hook.js
├── scripts/
│   ├── print-hooks.js
│   ├── install-autostart.js
│   └── simulate.sh
├── src/
│   ├── main/
│   │   ├── main.ts
│   │   ├── window.ts
│   │   ├── watcher.ts
│   │   ├── state-machine.ts
│   │   ├── prefs.ts
│   │   └── tray.ts
│   ├── preload.ts
│   └── renderer/
│       ├── index.html
│       ├── renderer.ts
│       └── style.css
└── themes/
    └── clawd/
        ├── theme.json
        ├── NOTICE.md
        ├── PERMISSION.md
        └── clawd-*.svg
```

`hook/hook.js` fica em JS puro, sem build: o Claude chama o hook direto, e build nele seria um ponto de falha a mais.

### Stack

- Electron (versão estável atual) + TypeScript compilado com `tsc`, sem bundler.
- Nenhuma dependência de runtime além do Electron.
- `electron-builder` só se um dia virar `.deb`. Na v1, roda do clone com `npm start`.

---

## 7. Teste manual

Não há suíte de testes na v1. A validação é por simulação:

```bash
./scripts/simulate.sh
```

O script faz o `echo` de payloads JSON falsos para o `hook.js`, percorrendo todos os eventos com pausas.

### Checklist

- [ ] Cada evento troca para o sprite esperado.
- [ ] Duas sessões simultâneas: `attention` numa e `working` na outra → mostra `attention`.
- [ ] `Stop` → `done` por 3 s → `idle`.
- [ ] Sem eventos por 60 s → bocejo; por 5 min → dorme; um evento → acorda.
- [ ] Matar o Claude sem `SessionEnd` → a sessão some do cálculo em 10 min.
- [ ] Com o app fechado, o Claude funciona normal e o hook não gera erro visível.
- [ ] Arrastar, fechar e reabrir → mesma posição.
- [ ] Funciona em sessão Xorg e em sessão Wayland (via XWayland): arrastar, posição salva, sempre por cima.
- [ ] Funciona com sessão do **Claude Desktop** (aba Code) e com o **CLI** no terminal.
- [ ] Hook com stdin vazio ou JSON inválido → sai com código 0, sem escrever nada.
- [ ] Tempo do hook medido: meta < 100 ms (`time` no simulate).

---

## 8. Fases

| Fase | Entrega |
|---|---|
| **1. Esqueleto** | Hook + watcher + janela mostrando o nome do estado em texto. Valida o pipeline de ponta a ponta com o Claude Desktop |
| **2. Sprites** | Importação dos SVGs, renderer `<img>`, pré-carga, mapa estado → SVG |
| **3. Comportamento** | Prioridade entre sessões, one-shots, variações de idle, sequência de sono, sessões velhas |
| **4. Conforto** | Arrastar com o sprite `drag` + posição salva, tray, autostart, `print-hooks` |

---

## 9. Decisões em aberto

1. **Repo público ou privado?** Se for público, é preciso confirmar com o autor que a permissão cobre redistribuir os SVGs, e não só usá-los.
2. **Tamanho padrão do pet:** 160 px dá conta?
3. **Som ao terminar ou ao pedir atenção:** fora da v1?
4. **Notificação nativa do sistema no `attention`:** é redundante com o próprio desktop, que já notifica, então fica fora?
5. **Mostrar o nome do projeto** num balãozinho quando há várias sessões: v2?
