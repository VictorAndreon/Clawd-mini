# clawd-mini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mascote de desktop (Electron, Linux/X11) que mostra, via sprites SVG animados, o estado das sessões do Claude Code, alimentado por um hook que só escreve arquivos locais.

**Architecture:** `hook/hook.js` (JS puro, Node ≥ 12) recebe o JSON do hook no stdin e grava `~/.clawd-mini/sessions/<id>.json` de forma atômica. O main do Electron observa esse diretório (`fs.watch` + varredura de 10 s), agrega as sessões numa máquina de estados pura (`state-machine.ts`), passa por um apresentador com relógio (`presenter.ts`: one-shots, idle, sono) e manda o nome do SVG para o renderer por IPC. Sem rede, sem porta, sem ler transcript.

**Tech Stack:** Electron 44, TypeScript (`tsc`, sem bundler, CommonJS), Node 22 para build/testes, `node:test` para testes (zero dependências extras).

**Spec:** `SPEC.md` (raiz do repo). Leia a spec inteira antes de começar qualquer task.

## Global Constraints

- Nenhuma rede de qualquer tipo, nenhuma porta escutando, nenhum servidor HTTP.
- O hook nunca lê/grava prompt, `tool_input`, `tool_response` ou `transcript_path`; `project` é só `basename(cwd)`.
- `hook/hook.js`: CommonJS, sem optional chaining, sem `??`, sem dependências, compatível com Node ≥ 12; **nunca escreve no stdout**; sai **sempre** com código 0; timeout de stdin de 1 s; escrita atômica (`.tmp` + `rename`).
- Diretório `~/.clawd-mini/sessions/` com modo `0700`; arquivos com modo `0600`.
- O app **nunca** edita `~/.claude/settings.json`. O usuário cola os hooks na mão.
- `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, com preload.
- Nenhuma dependência de runtime além do Electron.
- O backend Ozone só pode ser escolhido na linha de comando (`--ozone-platform=x11`), nunca via `app.commandLine`; só passar a flag se `$DISPLAY` não estiver vazio.
- Prioridade: `error 7 > attention 6 > sweeping 5 > done 4 > juggling 3 > working 2 > thinking 1 > idle 0`.
- Tempos: `done` 4 s, `error` 5 s, `attention` mínimo 5 s, `sweeping` até o próximo evento, `staleMs` 10 min, apagar após 24 h, `working` preso 5 min, variação de idle após 20 s, bocejo aos 60 s (3 s), colapso aos 10 min, `waking` 1,5 s.
- Sprites: arte de rullerzhou-afk, **uso não comercial**, NOTICE obrigatório. Nunca copiar código do clawd-on-desk.
- Hooks registrados com caminho **absoluto** do node, `"async": true`, `"timeout": 3`.

### Desvios conscientes da spec (confirmados com o usuário na revisão do plano)

1. **Testes automatizados com `node:test`** para as partes puras (hook, máquina de estados, apresentador, watcher, prefs, scripts). A spec diz "sem suíte na v1", mas isso não adiciona dependência e a máquina de estados é justamente a parte que quebra calada. A validação manual via `simulate.sh` continua.
2. **`PostCompact` → `idle`**: evento existe (confirmado na doc de hooks). Sem ele, um `/compact` manual deixaria o pet varrendo por 10 min.
3. **Filtro de `Notification`**: a doc lista 12 valores de `notification_type`. Só `permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog` e `agent_needs_input` viram `attention`. `idle_prompt` (disparado ~60 s depois do `Stop`) é ignorado, senão o pet nunca dormiria. Sem `notification_type` (versão antiga) → `attention`.
4. **Arquivos extras**: `src/main/paths.ts`, `theme.ts`, `presenter.ts`, `drag.ts` e `scripts/start.js` (launcher com a guarda do `$DISPLAY`). O `.desktop` chama o `start.js`, que aplica `--ozone-platform=x11` com a guarda.
5. **Inconsistências da spec resolvidas pelo corpo**: o checklist diz `done` 3 s e sono em 5 min; o corpo e as tabelas dizem 4 s e 10 min. Vale o corpo.

## Review Focus

1. **`session_id` malicioso ou estranho** (`../x`, vazio, com `/`): o hook não pode gravar fora de `sessions/`. Esperado: sai 0 sem gravar nada. → teste na Task 1.
2. **Hooks async fora de ordem** (o processo do `PostToolUse` termina antes do `PreToolUse`): evento mais velho que o gravado não pode sobrescrever. Esperado: descartado. → teste na Task 1.
3. **`Notification` que não pede nada** (`auth_success`, `idle_prompt`, `elicitation_complete`): esperado: não vira `attention`. → teste na Task 1.
4. **`prefs.json` corrompido ou editado à mão** (`size: "abc"`, `x: null`) e **IPC de arraste com lixo** (`NaN`): esperado: defaults e mensagens ignoradas, nunca janela em `NaN,NaN`. → testes na Task 9.
5. **Launch herdando `ELECTRON_RUN_AS_NODE`** (o Claude Desktop é Electron e o terminal dele pode vazar essa variável) ou duas instâncias (autostart + `npm start`): esperado: launcher remove a variável; segunda instância sai. → teste na Task 5 (+ `requestSingleInstanceLock`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `hook/hook.js` | Evento do Claude → registro da sessão. Exporta `computeNext` para teste. |
| `scripts/print-hooks.js` | Imprime o bloco `hooks` com caminhos absolutos. |
| `scripts/simulate.sh` | Percorre todos os eventos com payloads falsos. |
| `scripts/start.js` | Launcher do Electron (guarda do `$DISPLAY`, limpa env). |
| `scripts/install-autostart.js` | Cria/remove `~/.config/autostart/clawd-mini.desktop`. |
| `scripts/import-clawd-assets.sh` | Copia só os SVGs do `theme.json`. |
| `src/main/paths.ts` | Caminhos (`~/.clawd-mini`, raiz do app). `CLAWD_MINI_HOME` sobrescreve. |
| `src/main/state-machine.ts` | Tipos, prioridades, tempos, `effectiveState`, `aggregate` (puro). |
| `src/main/watcher.ts` | `readSessions` (parse, limpeza 24 h) e `watchSessions` (watch + debounce + varredura). |
| `src/main/theme.ts` | Carrega e valida `theme.json`. |
| `src/main/presenter.ts` | Estado agregado + relógio → arquivo SVG (holds, idle, sono, acordar, não perturbe). |
| `src/main/prefs.ts` | `prefs.json`: carregar, salvar atômico, validar posição. |
| `src/main/drag.ts` | IPC de arraste → `win.setPosition`. |
| `src/main/window.ts` | Cria a `BrowserWindow` do pet. |
| `src/main/tray.ts` | Tray opcional. |
| `src/main/main.ts` | Liga tudo. |
| `src/preload.ts` | `contextBridge` com a API mínima `window.clawd`. |
| `src/renderer/{index.html,renderer.ts,style.css}` | Desenha o sprite, pré-carrega, arraste. |
| `themes/clawd/{theme.json,NOTICE.md,PERMISSION.md,*.svg}` | Tema. |
| `test/*.test.ts` | Testes `node:test`, compilados para `dist/test/`. |

Convenção de build: `tsc` com `rootDir: "."` e `outDir: "dist"`. Então `src/main/main.ts` → `dist/src/main/main.js`, `test/x.test.ts` → `dist/test/x.test.js`. Testes que precisam de arquivos não compilados (`hook/hook.js`, `scripts/*.js`) usam `path.join(__dirname, '..', '..', ...)`.

`preload.ts` e `renderer.ts` são **scripts** (sem `import`/`export` no topo), para o `tsc` não emitir `exports`/`require` que o renderer sem Node não tem.

---

### Task 1: Scaffold + hook

**Files:**
- Create: `package.json`, `tsconfig.json`, `hook/hook.js`, `test/hook.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `hook/hook.js` exporta `computeNext(prev: object|null, event: string, input: object, now: number): Record|null` e `run(event, raw, now)`. Registro gravado:
  `{ sessionId: string, state: State, event: string, tool?: string, project: string, subagents: number, prevState?: State, updatedAt: number }`.
  Variável de ambiente `CLAWD_MINI_HOME` substitui `~/.clawd-mini` (usada por testes).

- [ ] **Step 1: Scaffold**

`package.json`:

```json
{
  "name": "clawd-mini",
  "version": "0.1.0",
  "private": true,
  "license": "UNLICENSED",
  "description": "Mascote de desktop que reage ao Claude Code",
  "main": "dist/src/main/main.js",
  "scripts": {
    "build": "tsc -p .",
    "start": "npm run build && node scripts/start.js",
    "test": "npm run build && node --test \"dist/test/**/*.test.js\"",
    "print-hooks": "node scripts/print-hooks.js",
    "simulate": "./scripts/simulate.sh",
    "import-assets": "./scripts/import-clawd-assets.sh",
    "install-autostart": "node scripts/install-autostart.js",
    "uninstall-autostart": "node scripts/install-autostart.js --uninstall"
  },
  "devDependencies": {
    "@types/node": "^22.20.4",
    "electron": "^44.4.5",
    "typescript": "~5.9.3"
  }
}
```

(`typescript` fica no 5.9 de propósito: o 7.x é o port nativo e é mudança grande demais para ganhar nada aqui.)

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": false
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`.gitignore` (substituir):

```
node_modules/
dist/
*.tmp
```

Run: `npm install`
Expected: instala sem erro (baixa o binário do Electron).

- [ ] **Step 2: Escrever os testes do hook**

`test/hook.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

type Rec = Record<string, unknown> | null;
interface HookModule {
  computeNext(prev: Rec, event: string, input: Record<string, unknown>, now: number): Rec;
}

const HOOK = path.join(__dirname, '..', '..', 'hook', 'hook.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hook: HookModule = require(HOOK);

const ID = 'abc-123';
const base = { session_id: ID, cwd: '/home/u/projetos/efesus' };

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-hook-'));
}
function runHook(home: string, event: string, stdin: string) {
  return spawnSync(process.execPath, [HOOK, event], {
    input: stdin,
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAWD_MINI_HOME: home },
  });
}
function recPath(home: string, id: string): string {
  return path.join(home, 'sessions', id + '.json');
}

test('mapa evento → estado', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['SessionStart', {}, 'idle'],
    ['UserPromptSubmit', {}, 'thinking'],
    ['PreToolUse', { tool_name: 'Read' }, 'working'],
    ['PostToolUse', { tool_name: 'Read' }, 'thinking'],
    ['PostToolUseFailure', {}, 'error'],
    ['PreCompact', {}, 'sweeping'],
    ['PostCompact', {}, 'idle'],
    ['Notification', { notification_type: 'permission_prompt' }, 'attention'],
    ['Notification', { notification_type: 'agent_needs_input' }, 'attention'],
    ['Notification', {}, 'attention'],
    ['Stop', {}, 'done'],
  ];
  for (const [ev, extra, want] of cases) {
    const r = hook.computeNext(null, ev, { ...base, ...extra }, 1000);
    assert.equal(r && r.state, want, ev);
  }
});

test('evento desconhecido → null', () => {
  assert.equal(hook.computeNext(null, 'Banana', base, 1), null);
});

test('Notification que não pede o usuário → null', () => {
  for (const t of ['auth_success', 'idle_prompt', 'elicitation_complete', 'quota_auto_resume_fired']) {
    assert.equal(hook.computeNext(null, 'Notification', { ...base, notification_type: t }, 1), null, t);
  }
});

test('tool só em Pre/PostToolUse; project é basename', () => {
  const pre = hook.computeNext(null, 'PreToolUse', { ...base, tool_name: 'Edit' }, 1)!;
  assert.equal(pre.tool, 'Edit');
  assert.equal(pre.project, 'efesus');
  const stop = hook.computeNext(pre, 'Stop', { ...base, tool_name: 'Edit' }, 2)!;
  assert.equal('tool' in stop, false);
  const noCwd = hook.computeNext(pre, 'Stop', { session_id: ID }, 3)!;
  assert.equal(noCwd.project, 'efesus');
});

test('evento mais velho que o gravado é descartado (hooks async fora de ordem)', () => {
  const prev = { sessionId: ID, state: 'thinking', updatedAt: 2000 };
  assert.equal(hook.computeNext(prev, 'PreToolUse', base, 1500), null);
});

test('contador de subagentes e volta ao estado anterior', () => {
  const r1 = hook.computeNext({ state: 'working', updatedAt: 0, subagents: 0 }, 'SubagentStart', base, 1)!;
  assert.deepEqual([r1.state, r1.subagents, r1.prevState], ['juggling', 1, 'working']);
  const r2 = hook.computeNext(r1, 'SubagentStart', base, 2)!;
  assert.deepEqual([r2.state, r2.subagents, r2.prevState], ['juggling', 2, 'working']);
  const r3 = hook.computeNext(r2, 'PreToolUse', { ...base, tool_name: 'Read' }, 3)!;
  assert.equal(r3.state, 'juggling');
  const r4 = hook.computeNext(r3, 'Notification', { ...base, notification_type: 'permission_prompt' }, 4)!;
  assert.deepEqual([r4.state, r4.subagents], ['attention', 2]);
  const r5 = hook.computeNext(r4, 'SubagentStop', base, 5)!;
  assert.deepEqual([r5.state, r5.subagents], ['juggling', 1]);
  const r6 = hook.computeNext(r5, 'SubagentStop', base, 6)!;
  assert.deepEqual([r6.state, r6.subagents, 'prevState' in r6], ['working', 0, false]);
  assert.equal(hook.computeNext(r6, 'SubagentStop', base, 7), null);
});

test('Stop e UserPromptSubmit zeram subagentes', () => {
  const prev = { state: 'juggling', subagents: 2, prevState: 'working', updatedAt: 0 };
  for (const ev of ['Stop', 'UserPromptSubmit']) {
    const r = hook.computeNext(prev, ev, base, 1)!;
    assert.equal(r.subagents, 0, ev);
    assert.equal('prevState' in r, false, ev);
  }
});

test('grava arquivo 0600 em dir 0700, sem stdout e sem campos proibidos', () => {
  const home = tmpHome();
  const payload = {
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf segredo' },
    tool_response: 'segredo',
    prompt: 'segredo',
    transcript_path: '/segredo.jsonl',
  };
  const r = runHook(home, 'PreToolUse', JSON.stringify(payload));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  const file = recPath(home, ID);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  const raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw.includes('segredo'), false);
  const rec = JSON.parse(raw);
  assert.deepEqual(Object.keys(rec).sort(), ['event', 'project', 'sessionId', 'state', 'subagents', 'tool', 'updatedAt']);
  assert.equal(rec.state, 'working');
  assert.equal(fs.readdirSync(path.dirname(file)).some((f) => f.endsWith('.tmp')), false);
});

test('SessionEnd apaga o arquivo', () => {
  const home = tmpHome();
  runHook(home, 'SessionStart', JSON.stringify(base));
  assert.ok(fs.existsSync(recPath(home, ID)));
  const r = runHook(home, 'SessionEnd', JSON.stringify(base));
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(recPath(home, ID)), false);
});

test('stdin vazio, JSON inválido e session_id perigoso: exit 0 sem gravar', () => {
  for (const [stdin, label] of [
    ['', 'vazio'],
    ['não é json', 'inválido'],
    ['[1,2]', 'array'],
    [JSON.stringify({ session_id: '../evil', cwd: '/x' }), 'traversal'],
    [JSON.stringify({ session_id: 'a/b', cwd: '/x' }), 'barra'],
    [JSON.stringify({ session_id: '', cwd: '/x' }), 'id vazio'],
  ]) {
    const home = tmpHome();
    const r = runHook(home, 'Stop', stdin);
    assert.equal(r.status, 0, label);
    assert.equal(r.stdout, '', label);
    assert.deepEqual(fs.readdirSync(home), [], label);
  }
});

test('stdin que nunca fecha: sai com 0 em ~1 s', async () => {
  const home = tmpHome();
  const t0 = Date.now();
  const child = spawn(process.execPath, [HOOK, 'Stop'], {
    env: { ...process.env, CLAWD_MINI_HOME: home },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  child.stdin.destroy();
  assert.equal(code, 0);
  assert.ok(Date.now() - t0 < 3000, `demorou ${Date.now() - t0} ms`);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('hook.js só usa sintaxe/APIs de Node 12', () => {
  const src = fs.readFileSync(HOOK, 'utf8');
  for (const [re, what] of [
    [/\?\./, 'optional chaining'],
    [/\?\?/, 'nullish coalescing'],
    [/\|\|=|&&=/, 'logical assignment'],
    [/^\s*import\s/m, 'ESM import'],
    [/\brmSync\b|\.at\(|\breplaceAll\b|\bstructuredClone\b/, 'API nova'],
  ] as Array<[RegExp, string]>) {
    assert.equal(re.test(src), false, what);
  }
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../hook/hook.js'`.

- [ ] **Step 4: Implementar o hook**

`hook/hook.js`:

```js
#!/usr/bin/env node
// clawd-mini hook: evento do Claude Code -> ~/.clawd-mini/sessions/<session_id>.json
// Node >= 12, CommonJS, sem dependências. Nunca escreve no stdout e sai sempre com 0.
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var STDIN_TIMEOUT_MS = 1000;
var SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

var EVENT_STATE = {
  SessionStart: 'idle',
  UserPromptSubmit: 'thinking',
  PreToolUse: 'working',
  PostToolUse: 'thinking',
  PostToolUseFailure: 'error',
  PreCompact: 'sweeping',
  PostCompact: 'idle',
  Notification: 'attention',
  Stop: 'done'
};

// Só esses tipos significam "o Claude precisa de você". Os outros (auth_success,
// idle_prompt, elicitation_complete...) não mudam o estado.
var ATTENTION_TYPES = {
  permission_prompt: true,
  elicitation_dialog: true,
  elicitation_url_dialog: true,
  agent_needs_input: true
};

var RESET_SUBAGENTS = { SessionStart: true, UserPromptSubmit: true, Stop: true };
var TOOL_EVENTS = { PreToolUse: true, PostToolUse: true };
var BUSY = { thinking: true, working: true };

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function baseDir() {
  return process.env.CLAWD_MINI_HOME || path.join(os.homedir(), '.clawd-mini');
}

// Função pura: registro anterior + evento -> novo registro, ou null (não gravar).
function computeNext(prev, event, input, now) {
  if (prev && typeof prev.updatedAt === 'number' && prev.updatedAt > now) return null;

  var subagents = prev && typeof prev.subagents === 'number' && prev.subagents > 0 ? prev.subagents : 0;
  var prevState = prev && typeof prev.state === 'string' ? prev.state : 'idle';
  var saved = prev && typeof prev.prevState === 'string' ? prev.prevState : undefined;
  var state;

  if (event === 'SubagentStart') {
    if (prevState !== 'juggling') saved = BUSY[prevState] ? prevState : 'thinking';
    subagents += 1;
    state = 'juggling';
  } else if (event === 'SubagentStop') {
    if (subagents === 0) return null;
    subagents -= 1;
    if (subagents > 0) {
      state = 'juggling';
    } else {
      state = saved || 'thinking';
      saved = undefined;
    }
  } else if (has(EVENT_STATE, event)) {
    if (event === 'Notification' && typeof input.notification_type === 'string' &&
        !ATTENTION_TYPES[input.notification_type]) {
      return null;
    }
    state = EVENT_STATE[event];
    if (RESET_SUBAGENTS[event]) {
      subagents = 0;
      saved = undefined;
    } else if (subagents > 0 && BUSY[state]) {
      state = 'juggling';
    }
  } else {
    return null;
  }

  var rec = {
    sessionId: input.session_id,
    state: state,
    event: event,
    project: typeof input.cwd === 'string' ? path.basename(input.cwd) : (prev && prev.project) || '',
    subagents: subagents,
    updatedAt: now
  };
  if (TOOL_EVENTS[event] && typeof input.tool_name === 'string') rec.tool = input.tool_name.slice(0, 64);
  if (saved && subagents > 0) rec.prevState = saved;
  return rec;
}

function run(event, raw, now) {
  if (!event || !raw) return;
  var input;
  try { input = JSON.parse(raw); } catch (e) { return; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  var id = input.session_id;
  if (typeof id !== 'string' || !SESSION_ID_RE.test(id)) return;

  var dir = path.join(baseDir(), 'sessions');
  var file = path.join(dir, id + '.json');

  if (event === 'SessionEnd') {
    try { fs.unlinkSync(file); } catch (e) { /* já não existe */ }
    return;
  }

  var prev = null;
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { prev = null; }
  var next = computeNext(prev, event, input, now);
  if (!next) return;

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  var tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readStdin(timeoutMs, done) {
  var chunks = [];
  var finished = false;
  var timer = setTimeout(function () { finish(false); }, timeoutMs);
  function finish(ok) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    done(ok ? Buffer.concat(chunks).toString('utf8') : '');
  }
  process.stdin.on('data', function (c) { chunks.push(c); });
  process.stdin.on('end', function () { finish(true); });
  process.stdin.on('error', function () { finish(false); });
}

function main() {
  process.on('uncaughtException', function () { process.exit(0); });
  var startedAt = Date.now();
  var event = process.argv[2];
  readStdin(STDIN_TIMEOUT_MS, function (raw) {
    try { run(event, raw, startedAt); } catch (e) { /* nunca atrapalha o Claude */ }
    process.exit(0);
  });
}

module.exports = { computeNext: computeNext, run: run };

if (require.main === module) main();
```

Run: `chmod +x hook/hook.js`

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS em todos os testes de `hook.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore hook/hook.js test/hook.test.ts
git commit -m "feat: hook que grava o estado da sessão em arquivo"
```

---

### Task 2: `print-hooks` e `simulate.sh`

**Files:**
- Create: `scripts/print-hooks.js`, `scripts/simulate.sh`, `test/print-hooks.test.ts`

**Interfaces:**
- Consumes: `hook/hook.js` (Task 1), `CLAWD_MINI_HOME`.
- Produces: `scripts/print-hooks.js` exporta `buildHooks(nodePath: string, hookPath: string): { hooks: Record<string, Array<{matcher: string, hooks: Array<{type: 'command', command: string, async: true, timeout: 3}>}>> }` e `EVENTS: string[]`.

- [ ] **Step 1: Teste**

`test/print-hooks.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

interface HookCmd { type: string; command: string; async: boolean; timeout: number }
interface PrintHooks {
  EVENTS: string[];
  buildHooks(node: string, hook: string): { hooks: Record<string, Array<{ matcher: string; hooks: HookCmd[] }>> };
}
const ROOT = path.join(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ph: PrintHooks = require(path.join(ROOT, 'scripts', 'print-hooks.js'));

test('um bloco por evento, async, timeout 3, matcher vazio', () => {
  const out = ph.buildHooks('/usr/bin/node', '/repo/hook/hook.js');
  assert.deepEqual(Object.keys(out.hooks), ph.EVENTS);
  assert.equal(ph.EVENTS.length, 12);
  for (const ev of ph.EVENTS) {
    const [block] = out.hooks[ev];
    assert.equal(block.matcher, '');
    assert.deepEqual(block.hooks[0], {
      type: 'command',
      command: `'/usr/bin/node' '/repo/hook/hook.js' ${ev}`,
      async: true,
      timeout: 3,
    });
  }
});

test('comando funciona via shell com espaço e aspas simples no caminho', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-ph-'));
  const dir = path.join(tmp, "dir com espaço", "it's");
  fs.mkdirSync(dir, { recursive: true });
  const hookCopy = path.join(dir, 'hook.js');
  fs.copyFileSync(path.join(ROOT, 'hook', 'hook.js'), hookCopy);
  const home = path.join(tmp, 'home');
  const cmd = ph.buildHooks(process.execPath, hookCopy).hooks.Stop[0].hooks[0].command;
  const r = spawnSync('sh', ['-c', cmd], {
    input: JSON.stringify({ session_id: 'q1', cwd: '/x/proj' }),
    env: { ...process.env, CLAWD_MINI_HOME: home },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  const rec = JSON.parse(fs.readFileSync(path.join(home, 'sessions', 'q1.json'), 'utf8'));
  assert.equal(rec.state, 'done');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/print-hooks.js'`.

- [ ] **Step 3: Implementar `scripts/print-hooks.js`**

```js
#!/usr/bin/env node
// Imprime o bloco "hooks" para colar em ~/.claude/settings.json.
// Usa o caminho absoluto do node atual: o Claude Desktop não carrega o nvm do shell.
'use strict';
const path = require('path');

const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact', 'Notification', 'Stop', 'SessionEnd',
];

function shq(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildHooks(nodePath, hookPath) {
  const hooks = {};
  for (const ev of EVENTS) {
    hooks[ev] = [{
      matcher: '',
      hooks: [{ type: 'command', command: `${shq(nodePath)} ${shq(hookPath)} ${ev}`, async: true, timeout: 3 }],
    }];
  }
  return { hooks };
}

module.exports = { buildHooks, EVENTS };

if (require.main === module) {
  const hookPath = path.resolve(__dirname, '..', 'hook', 'hook.js');
  process.stdout.write(JSON.stringify(buildHooks(process.execPath, hookPath), null, 2) + '\n');
  process.stderr.write(
    '\nCole o conteúdo de "hooks" dentro de ~/.claude/settings.json (mesclando se já houver hooks).\n' +
    `Node usado: ${process.execPath}. Se esse node sumir (upgrade do nvm), rode de novo.\n`
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: `scripts/simulate.sh`**

```bash
#!/usr/bin/env bash
# Percorre todos os eventos do hook com payloads falsos. Rode com o app aberto (npm start).
# PAUSE=segundos entre eventos (padrão 3).
set -euo pipefail
cd "$(dirname "$0")/.."
HOOK="$PWD/hook/hook.js"
PAUSE="${PAUSE:-3}"

send() { # send <session> <evento> [campos-json-extras]
  local sid="$1" ev="$2" extra="${3:-}"
  local payload="{\"session_id\":\"$sid\",\"cwd\":\"/tmp/sim-project\",\"hook_event_name\":\"$ev\"${extra:+,$extra}}"
  printf '▶ %-6s %-20s %s' "$sid" "$ev" "$extra"
  local t0 t1
  t0=$(date +%s%N)
  node "$HOOK" "$ev" <<<"$payload"
  t1=$(date +%s%N)
  printf '  (%d ms)\n' $(( (t1 - t0) / 1000000 ))
  sleep "$PAUSE"
}

echo "== uma sessão, todos os eventos =="
send sim-a SessionStart
send sim-a UserPromptSubmit
send sim-a PreToolUse '"tool_name":"Read"'
send sim-a PostToolUse '"tool_name":"Read"'
send sim-a PreToolUse '"tool_name":"Edit"'
send sim-a PostToolUse '"tool_name":"Edit"'
send sim-a PreToolUse '"tool_name":"Bash"'
send sim-a PostToolUseFailure '"tool_name":"Bash"'
send sim-a SubagentStart
send sim-a SubagentStart
send sim-a SubagentStop
send sim-a SubagentStop
send sim-a PreCompact
send sim-a PostCompact
send sim-a Notification '"notification_type":"permission_prompt"'
send sim-a Notification '"notification_type":"auth_success"'

echo "== duas sessões: attention (sim-b) vence working (sim-a) =="
send sim-a PreToolUse '"tool_name":"Read"'
send sim-b Notification '"notification_type":"permission_prompt"'
send sim-b SessionEnd
send sim-a Stop

echo "== entradas ruins (devem sair 0 sem gravar) =="
node "$HOOK" Stop </dev/null; echo "stdin vazio      → exit $?"
echo 'não é json' | node "$HOOK" Stop; echo "json inválido    → exit $?"
t0=$(date +%s%N); sleep 3 | node "$HOOK" Stop; t1=$(date +%s%N)
echo "stdin sem fim    → exit $? em $(( (t1 - t0) / 1000000 )) ms (esperado ~1000)"

send sim-a SessionEnd
echo "fim. ~/.clawd-mini/sessions deve estar vazio:"
ls -A "${CLAWD_MINI_HOME:-$HOME/.clawd-mini}/sessions"
```

Run: `chmod +x scripts/simulate.sh && PAUSE=0 CLAWD_MINI_HOME=$(mktemp -d) ./scripts/simulate.sh`
Expected: todas as linhas com tempo < 100 ms (meta da spec; se passar disso, anote o número real no commit), três linhas de "exit 0", "stdin sem fim" em ~1000 ms (o `sleep 3` do lado esquerdo não segura o hook), e listagem final vazia.

Run: `npm run print-hooks`
Expected: JSON com 12 eventos e o caminho absoluto de `node` e de `hook/hook.js`.

- [ ] **Step 6: Commit**

```bash
git add scripts/print-hooks.js scripts/simulate.sh test/print-hooks.test.ts
git commit -m "feat: print-hooks e simulador de eventos"
```

---

### Task 3: Máquina de estados (agregação entre sessões)

**Files:**
- Create: `src/main/state-machine.ts`, `test/state-machine.test.ts`

**Interfaces:**
- Produces (`src/main/state-machine.ts`):
  - `type State = 'idle'|'thinking'|'working'|'juggling'|'done'|'sweeping'|'attention'|'error'`
  - `type BaseKey = State | 'typing' | 'building' | 'juggling2'`
  - `const PRIORITY: Record<State, number>`
  - `const TIMING: { doneMs, errorMs, staleMs, workingStuckMs, deleteAfterMs }`
  - `interface SessionRecord { sessionId: string; state: State; event: string; tool?: string; project: string; subagents: number; prevState?: State; updatedAt: number }`
  - `interface Aggregate { state: State; key: BaseKey; lastEventAt: number; active: number }`
  - `isState(v: unknown): v is State`
  - `effectiveState(r: SessionRecord, now: number): State`
  - `aggregate(records: SessionRecord[], now: number): Aggregate`

- [ ] **Step 1: Teste**

`test/state-machine.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, effectiveState, PRIORITY, SessionRecord, State } from '../src/main/state-machine';

const NOW = 10_000_000;
function r(p: Partial<SessionRecord> & { state: State }): SessionRecord {
  return { sessionId: 's', event: 'x', project: 'p', subagents: 0, updatedAt: NOW, ...p };
}

test('attention numa sessão vence working na outra', () => {
  const a = aggregate([r({ sessionId: 'a', state: 'working' }), r({ sessionId: 'b', state: 'attention' })], NOW);
  assert.equal(a.state, 'attention');
  assert.equal(a.active, 2);
});

test('ordem completa de prioridade', () => {
  const order: State[] = ['idle', 'thinking', 'working', 'juggling', 'done', 'sweeping', 'attention', 'error'];
  order.forEach((s, i) => assert.equal(PRIORITY[s], i, s));
  for (let i = 0; i < order.length - 1; i++) {
    const lo = r({ sessionId: 'lo', state: order[i] });
    const hi = r({ sessionId: 'hi', state: order[i + 1], updatedAt: NOW - 1 });
    assert.equal(aggregate([lo, hi], NOW).state, order[i + 1]);
  }
});

test('one-shots e working preso expiram pelo relógio', () => {
  assert.equal(effectiveState(r({ state: 'done', updatedAt: NOW - 3_999 }), NOW), 'done');
  assert.equal(effectiveState(r({ state: 'done', updatedAt: NOW - 4_000 }), NOW), 'idle');
  assert.equal(effectiveState(r({ state: 'error', updatedAt: NOW - 4_999 }), NOW), 'error');
  assert.equal(effectiveState(r({ state: 'error', updatedAt: NOW - 5_000 }), NOW), 'thinking');
  assert.equal(effectiveState(r({ state: 'working', updatedAt: NOW - 299_999 }), NOW), 'working');
  assert.equal(effectiveState(r({ state: 'working', updatedAt: NOW - 300_000 }), NOW), 'idle');
  assert.equal(effectiveState(r({ state: 'sweeping', updatedAt: NOW - 500_000 }), NOW), 'sweeping');
});

test('sessão velha sai do cálculo mas conta em lastEventAt', () => {
  const a = aggregate([r({ state: 'attention', updatedAt: NOW - 600_001 })], NOW);
  assert.deepEqual(a, { state: 'idle', key: 'idle', lastEventAt: NOW - 600_001, active: 0 });
  assert.equal(aggregate([r({ state: 'attention', updatedAt: NOW - 600_000 })], NOW).state, 'attention');
});

test('variantes de working e juggling', () => {
  const key = (p: Partial<SessionRecord> & { state: State }) => aggregate([r(p)], NOW).key;
  assert.equal(key({ state: 'working', tool: 'Edit' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'MultiEdit' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'NotebookEdit' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'Write' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'Bash' }), 'building');
  assert.equal(key({ state: 'working', tool: 'Read' }), 'working');
  assert.equal(key({ state: 'working' }), 'working');
  assert.equal(key({ state: 'juggling', subagents: 1 }), 'juggling');
  assert.equal(key({ state: 'juggling', subagents: 3 }), 'juggling2');
});

test('empate: a sessão mais recente decide a variante', () => {
  const a = aggregate([
    r({ sessionId: 'old', state: 'working', tool: 'Bash', updatedAt: NOW - 10 }),
    r({ sessionId: 'new', state: 'working', tool: 'Edit', updatedAt: NOW - 5 }),
  ], NOW);
  assert.equal(a.key, 'typing');
});

test('sem sessões → idle, lastEventAt 0', () => {
  assert.deepEqual(aggregate([], NOW), { state: 'idle', key: 'idle', lastEventAt: 0, active: 0 });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — erro de compilação `Cannot find module '../src/main/state-machine'`.

- [ ] **Step 3: Implementar**

`src/main/state-machine.ts`:

```ts
// Agregação pura: registros das sessões + relógio -> estado dominante.
export type State = 'idle' | 'thinking' | 'working' | 'juggling' | 'done' | 'sweeping' | 'attention' | 'error';
export type BaseKey = State | 'typing' | 'building' | 'juggling2';

export const PRIORITY: Record<State, number> = {
  idle: 0, thinking: 1, working: 2, juggling: 3, done: 4, sweeping: 5, attention: 6, error: 7,
};

export const TIMING = {
  doneMs: 4_000,
  errorMs: 5_000,
  staleMs: 10 * 60_000,
  workingStuckMs: 5 * 60_000,
  deleteAfterMs: 24 * 60 * 60_000,
} as const;

export interface SessionRecord {
  sessionId: string;
  state: State;
  event: string;
  tool?: string;
  project: string;
  subagents: number;
  prevState?: State;
  updatedAt: number;
}

export interface Aggregate {
  state: State;
  key: BaseKey;
  lastEventAt: number;
  active: number;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export function isState(v: unknown): v is State {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PRIORITY, v);
}

export function effectiveState(r: SessionRecord, now: number): State {
  const age = now - r.updatedAt;
  switch (r.state) {
    case 'done': return age < TIMING.doneMs ? 'done' : 'idle';
    case 'error': return age < TIMING.errorMs ? 'error' : 'thinking';
    case 'working': return age < TIMING.workingStuckMs ? 'working' : 'idle';
    default: return r.state;
  }
}

function keyFor(state: State, r: SessionRecord): BaseKey {
  if (state === 'working') {
    if (r.tool && EDIT_TOOLS.has(r.tool)) return 'typing';
    if (r.tool === 'Bash') return 'building';
    return 'working';
  }
  if (state === 'juggling') return r.subagents >= 2 ? 'juggling2' : 'juggling';
  return state;
}

export function aggregate(records: SessionRecord[], now: number): Aggregate {
  let best: { state: State; rec: SessionRecord } | null = null;
  let lastEventAt = 0;
  let active = 0;
  for (const rec of records) {
    lastEventAt = Math.max(lastEventAt, rec.updatedAt);
    if (now - rec.updatedAt > TIMING.staleMs) continue;
    const s = effectiveState(rec, now);
    if (s !== 'idle') active++;
    const better = !best
      || PRIORITY[s] > PRIORITY[best.state]
      || (PRIORITY[s] === PRIORITY[best.state] && rec.updatedAt > best.rec.updatedAt);
    if (better) best = { state: s, rec };
  }
  if (!best) return { state: 'idle', key: 'idle', lastEventAt, active: 0 };
  return { state: best.state, key: keyFor(best.state, best.rec), lastEventAt, active };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/state-machine.ts test/state-machine.test.ts
git commit -m "feat: máquina de estados com prioridade entre sessões"
```

---

### Task 4: Watcher

**Files:**
- Create: `src/main/watcher.ts`, `test/watcher.test.ts`

**Interfaces:**
- Consumes: `SessionRecord`, `TIMING`, `isState` (Task 3).
- Produces:
  - `parseRecord(raw: string): SessionRecord | null`
  - `readSessions(dir: string, now: number): SessionRecord[]` — ignora inválidos e `.tmp`; apaga `.json`/`.tmp` com mais de 24 h.
  - `watchSessions(dir: string, onChange: (records: SessionRecord[]) => void, opts?: { debounceMs?: number; sweepMs?: number; now?: () => number }): () => void` — cria o diretório (0700), emite uma vez na hora, a cada mudança (debounce 50 ms) e a cada `sweepMs` (10 s). Retorna `stop`.

- [ ] **Step 1: Teste**

`test/watcher.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSessions, watchSessions } from '../src/main/watcher';
import type { SessionRecord } from '../src/main/state-machine';

const DAY = 24 * 60 * 60_000;
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-watch-'));
}
function write(dir: string, name: string, content: unknown): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}
const rec = (id: string, updatedAt: number) =>
  ({ sessionId: id, state: 'working', event: 'PreToolUse', project: 'p', subagents: 0, updatedAt });

async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout esperando condição');
    await new Promise((res) => setTimeout(res, 10));
  }
}

test('readSessions ignora JSON inválido, .tmp e registro sem campos obrigatórios', () => {
  const dir = tmpDir();
  const now = Date.now();
  write(dir, 'ok.json', rec('ok', now));
  write(dir, 'meio.json', '{"sessionId":"x","sta');
  write(dir, 'x.json.123.tmp', rec('tmp', now));
  write(dir, 'semstate.json', { sessionId: 'y', updatedAt: now });
  write(dir, 'estadoruim.json', { ...rec('z', now), state: 'dancing' });
  const out = readSessions(dir, now);
  assert.deepEqual(out.map((r) => r.sessionId), ['ok']);
  assert.equal(out[0].subagents, 0);
});

test('readSessions apaga arquivos com mais de 24 h', () => {
  const dir = tmpDir();
  const now = Date.now();
  const old = write(dir, 'old.json', rec('old', now - DAY - 1));
  const lixo = write(dir, 'lixo.json', 'não é json');
  const oldTmp = write(dir, 'a.json.9.tmp', 'x');
  const past = (now - DAY - 60_000) / 1000;
  fs.utimesSync(lixo, past, past);
  fs.utimesSync(oldTmp, past, past);
  const fresh = write(dir, 'fresh.json', rec('fresh', now));
  assert.deepEqual(readSessions(dir, now).map((r) => r.sessionId), ['fresh']);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(lixo), false);
  assert.equal(fs.existsSync(oldTmp), false);
  assert.equal(fs.existsSync(fresh), true);
});

test('readSessions em diretório inexistente devolve []', () => {
  assert.deepEqual(readSessions(path.join(tmpDir(), 'nao-existe'), Date.now()), []);
});

test('watchSessions cria o diretório (0700) e avisa quando um arquivo aparece', async () => {
  const dir = path.join(tmpDir(), 'sessions');
  const seen: SessionRecord[][] = [];
  const stop = watchSessions(dir, (r) => seen.push(r), { sweepMs: 60_000 });
  try {
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    assert.deepEqual(seen, [[]]);
    write(dir, 'a.json', rec('a', Date.now()));
    await waitFor(() => seen.some((r) => r.length === 1));
  } finally {
    stop();
  }
});

test('varredura periódica emite mesmo sem evento do fs.watch', async () => {
  const dir = tmpDir();
  let count = 0;
  const stop = watchSessions(dir, () => { count++; }, { sweepMs: 30 });
  try {
    await waitFor(() => count >= 4);
  } finally {
    stop();
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/main/watcher'`.

- [ ] **Step 3: Implementar**

`src/main/watcher.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isState, SessionRecord, TIMING } from './state-machine';

export function parseRecord(raw: string): SessionRecord | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.sessionId !== 'string' || !isState(o.state)) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
  return {
    sessionId: o.sessionId,
    state: o.state,
    event: typeof o.event === 'string' ? o.event : '',
    tool: typeof o.tool === 'string' ? o.tool : undefined,
    project: typeof o.project === 'string' ? o.project : '',
    subagents: typeof o.subagents === 'number' && o.subagents > 0 ? o.subagents : 0,
    prevState: isState(o.prevState) ? o.prevState : undefined,
    updatedAt: o.updatedAt,
  };
}

export function readSessions(dir: string, now: number): SessionRecord[] {
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out: SessionRecord[] = [];
  for (const name of names) {
    const isJson = name.endsWith('.json');
    if (!isJson && !name.endsWith('.tmp')) continue;
    const file = path.join(dir, name);
    let raw = '';
    let mtime: number;
    try {
      mtime = fs.statSync(file).mtimeMs;
      if (isJson) raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rec = isJson ? parseRecord(raw) : null;
    const age = now - (rec ? rec.updatedAt : mtime);
    if (age > TIMING.deleteAfterMs) {
      try { fs.unlinkSync(file); } catch { /* outro processo já apagou */ }
      continue;
    }
    if (rec) out.push(rec);
  }
  return out;
}

export interface WatchOptions {
  debounceMs?: number;
  sweepMs?: number;
  now?: () => number;
}

export function watchSessions(
  dir: string,
  onChange: (records: SessionRecord[]) => void,
  opts: WatchOptions = {},
): () => void {
  const debounceMs = opts.debounceMs ?? 50;
  const sweepMs = opts.sweepMs ?? 10_000;
  const now = opts.now ?? Date.now;
  let watcher: fs.FSWatcher | null = null;
  let timer: NodeJS.Timeout | null = null;

  const emit = (): void => {
    timer = null;
    onChange(readSessions(dir, now()));
  };
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(emit, debounceMs);
  };
  const ensureWatcher = (): void => {
    if (watcher) return;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      watcher = fs.watch(dir, schedule);
      watcher.on('error', () => {
        watcher?.close();
        watcher = null; // a varredura recria
      });
    } catch {
      watcher = null;
    }
  };

  ensureWatcher();
  // fs.watch no Linux perde evento às vezes: varredura de segurança.
  const sweep = setInterval(() => { ensureWatcher(); emit(); }, sweepMs);
  emit();

  return () => {
    clearInterval(sweep);
    if (timer) clearTimeout(timer);
    watcher?.close();
    watcher = null;
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/watcher.ts test/watcher.test.ts
git commit -m "feat: watcher do diretório de sessões com varredura e limpeza"
```

---

### Task 5: App fase 1 — janela com o estado em texto (ponta a ponta)

Entrega da **Fase 1** da spec: hook + watcher + janela mostrando o nome do estado.

**Files:**
- Create: `src/main/paths.ts`, `src/main/window.ts`, `src/main/main.ts`, `src/preload.ts`, `src/renderer/index.html`, `src/renderer/renderer.ts`, `src/renderer/style.css`, `scripts/start.js`, `test/start.test.ts`

**Interfaces:**
- Consumes: `watchSessions` (Task 4), `aggregate`, `SessionRecord` (Task 3).
- Produces:
  - `paths.ts`: `APP_ROOT: string`, `clawdHome(env?): string`, `SESSIONS_DIR: string`, `PREFS_FILE: string`.
  - `window.ts`: `createPetWindow(bounds: { x: number; y: number; size: number }): BrowserWindow`.
  - `scripts/start.js`: exporta `buildLaunch(env: NodeJS.ProcessEnv, root: string): { args: string[]; env: NodeJS.ProcessEnv }`.
  - IPC `state` (main → renderer, payload `string`). Substituído por `sprite` na Task 8.

- [ ] **Step 1: Teste do launcher**

`test/start.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

interface Start {
  buildLaunch(env: NodeJS.ProcessEnv, root: string): { args: string[]; env: NodeJS.ProcessEnv };
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const start: Start = require(path.join(__dirname, '..', '..', 'scripts', 'start.js'));

test('com DISPLAY passa --ozone-platform=x11', () => {
  assert.deepEqual(start.buildLaunch({ DISPLAY: ':0' }, '/repo').args, ['/repo', '--ozone-platform=x11']);
});

test('sem DISPLAY (Wayland sem XWayland) não passa a flag', () => {
  assert.deepEqual(start.buildLaunch({ DISPLAY: '' }, '/repo').args, ['/repo']);
  assert.deepEqual(start.buildLaunch({}, '/repo').args, ['/repo']);
});

test('remove ELECTRON_RUN_AS_NODE herdado e preserva o resto', () => {
  const { env } = start.buildLaunch({ DISPLAY: ':0', ELECTRON_RUN_AS_NODE: '1', HOME: '/h' }, '/repo');
  assert.equal('ELECTRON_RUN_AS_NODE' in env, false);
  assert.equal(env.HOME, '/h');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/start.js'`.

- [ ] **Step 3: `scripts/start.js`**

```js
#!/usr/bin/env node
// Launcher do Electron. O backend Ozone é escolhido em C++ antes do main rodar,
// então --ozone-platform=x11 tem que vir na linha de comando.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function buildLaunch(env, root) {
  const args = [root];
  // Sem X server, --ozone-platform=x11 faz o Chromium abortar antes do ready.
  if (env.DISPLAY) args.push('--ozone-platform=x11');
  const childEnv = { ...env };
  // Herdado de apps Electron (ex.: terminal do Claude Desktop): faria o electron rodar como node.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  return { args, env: childEnv };
}

module.exports = { buildLaunch };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  if (!fs.existsSync(path.join(root, 'dist', 'src', 'main', 'main.js'))) {
    console.error('clawd-mini: dist/ não existe. Rode `npm run build` (ou `npm start`).');
    process.exit(1);
  }
  const electron = require('electron'); // no node, devolve o caminho do binário
  const { args, env } = buildLaunch(process.env, root);
  const child = spawn(electron, args, { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: `src/main/paths.ts`**

```ts
import * as os from 'node:os';
import * as path from 'node:path';

// dist/src/main/paths.js -> raiz do repo
export const APP_ROOT = path.resolve(__dirname, '..', '..', '..');

export function clawdHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWD_MINI_HOME || path.join(os.homedir(), '.clawd-mini');
}

export const SESSIONS_DIR = path.join(clawdHome(), 'sessions');
export const PREFS_FILE = path.join(clawdHome(), 'prefs.json');
```

- [ ] **Step 5: `src/main/window.ts`**

```ts
import { BrowserWindow } from 'electron';
import * as path from 'node:path';
import { APP_ROOT } from './paths';

export function createPetWindow(bounds: { x: number; y: number; size: number }): BrowserWindow {
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.size,
    height: bounds.size,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    type: 'toolbar',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(APP_ROOT, 'dist', 'src', 'preload.js'),
    },
  });
  // Se 'floating' ficar atrás de alguma janela, trocar para 'screen-saver' (spec, seção 4).
  win.setAlwaysOnTop(true, 'floating');
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.showInactive());
  void win.loadFile(path.join(APP_ROOT, 'src', 'renderer', 'index.html'));
  return win;
}
```

- [ ] **Step 6: `src/preload.ts`** (script, sem `import`)

```ts
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('clawd', {
  onState: (cb: (label: string) => void): void => {
    ipcRenderer.on('state', (_e, label: string) => cb(label));
  },
});
```

- [ ] **Step 7: Renderer**

`src/renderer/index.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="label">…</div>
  <script src="../../dist/src/renderer/renderer.js"></script>
</body>
</html>
```

`src/renderer/style.css`:

```css
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  user-select: none;
}

#label {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font: bold 18px monospace;
  color: #d97757;
  text-shadow: 0 0 3px #000;
}
```

`src/renderer/renderer.ts` (script, sem `import`):

```ts
interface ClawdApi {
  onState(cb: (label: string) => void): void;
}
interface Window {
  clawd: ClawdApi;
}

const labelEl = document.getElementById('label') as HTMLDivElement;
window.clawd.onState((label) => {
  labelEl.textContent = label;
});
```

- [ ] **Step 8: `src/main/main.ts`**

```ts
import { app, screen } from 'electron';
import { createPetWindow } from './window';
import { watchSessions } from './watcher';
import { aggregate, SessionRecord } from './state-machine';
import { SESSIONS_DIR } from './paths';

const TICK_MS = 250;
const SIZE = 160;

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);

function start(): void {
  const wa = screen.getPrimaryDisplay().workArea;
  const win = createPetWindow({ x: wa.x + wa.width - SIZE - 16, y: wa.y + wa.height - SIZE - 16, size: SIZE });

  let records: SessionRecord[] = [];
  let shown = '';
  const render = (): void => {
    if (win.isDestroyed()) return;
    const label = aggregate(records, Date.now()).key;
    if (label !== shown) {
      shown = label;
      win.webContents.send('state', label);
    }
  };
  win.webContents.on('did-finish-load', () => { shown = ''; render(); });
  watchSessions(SESSIONS_DIR, (r) => { records = r; render(); });
  setInterval(render, TICK_MS);
}
```

- [ ] **Step 9: Build + testes**

Run: `npm test`
Expected: compila sem erro e todos os testes PASS.

- [ ] **Step 10: Verificação manual com o simulador**

Run (em um terminal): `npm start`
Expected: janela 160×160 sem borda no canto inferior direito mostrando `idle` em laranja, fundo transparente.

- Se o fundo aparecer preto: é o bug conhecido de transparência do Electron no Linux. Troque em `main.ts` `void app.whenReady().then(start)` por `void app.whenReady().then(() => setTimeout(start, 300))` e teste de novo.
- Abra o DevTools uma vez (`win.webContents.openDevTools({ mode: 'detach' })` temporário em `start()`) e confirme que não há erro de CSP ou de preload no console. Remova a linha depois.

Run (em outro terminal): `./scripts/simulate.sh`
Expected: o texto acompanha cada evento: `idle`, `thinking`, `working`, `thinking`, `typing`, `thinking`, `building`, `error`, `juggling`, `juggling2`, `juggling`, `thinking` (o `SubagentStart` veio depois de um `error`, então o estado salvo é `thinking`), `sweeping`, `idle`, `attention` (o `auth_success` não muda nada), `working`, `attention` (sessão b vence), `working`, `done`, e `idle` depois de 4 s.

Run: `npm start` numa segunda aba enquanto o primeiro está aberto.
Expected: a segunda instância sai na hora; continua um pet só.

- [ ] **Step 11: Verificação ponta a ponta com o Claude de verdade**

Run: `npm run print-hooks`

**Pare e peça ao usuário** para colar o conteúdo de `"hooks"` em `~/.claude/settings.json` (o app e o executor não editam esse arquivo). Depois disso:

1. Com o `npm start` rodando, abra uma sessão no **Claude Desktop (aba Code)** e mande um prompt que leia e edite um arquivo.
   Expected: `thinking` → `working`/`typing` → `thinking` → `done` → `idle`.
2. Repita no **CLI** (`claude` no terminal).
3. Peça algo que exija permissão (em modo que pergunte). Expected: `attention` enquanto o diálogo está aberto.
4. Feche o app (`Ctrl+C` no `npm start`) e use o Claude normalmente. Expected: nenhum erro de hook visível no Claude.

Se algum evento não chegar, confira `ls -la ~/.clawd-mini/sessions/` e o conteúdo do JSON.

- [ ] **Step 12: Commit**

```bash
git add src scripts/start.js test/start.test.ts
git commit -m "feat: fase 1 — janela do pet mostrando o estado em texto"
```

---

### Task 6: Tema clawd — importação, licença e loader

**Files:**
- Create: `themes/clawd/theme.json`, `themes/clawd/NOTICE.md`, `themes/clawd/PERMISSION.md`, `scripts/import-clawd-assets.sh`, `src/main/theme.ts`, `test/theme.test.ts`, `themes/clawd/clawd-*.svg` (19 arquivos importados)

**Interfaces:**
- Produces (`src/main/theme.ts`):
  - `SPRITE_KEYS` (tupla readonly), `type SpriteKey = 'idle'|'thinking'|'working'|'typing'|'building'|'juggling'|'juggling2'|'attention'|'done'|'error'|'sweeping'|'yawning'|'dozing'|'collapsing'|'sleeping'|'waking'|'drag'`
  - `interface IdleVariation { file: string; durationMs: number }`
  - `interface Theme { name: string; dir: string; states: Record<SpriteKey, string>; idleVariations: IdleVariation[] }`
  - `loadTheme(dir: string): Theme` — lança `Error` com mensagem clara se faltar estado/arquivo ou nome de arquivo for suspeito.
  - `themeFiles(t: Theme): string[]` — arquivos únicos.

- [ ] **Step 1: `themes/clawd/theme.json`** (idêntico à spec, seção 5)

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

- [ ] **Step 2: Script de importação**

`scripts/import-clawd-assets.sh`:

```bash
#!/usr/bin/env bash
# Copia do clone do clawd-on-desk só os SVGs listados em themes/clawd/theme.json.
set -euo pipefail
src="${1:?uso: $0 <caminho-do-clone-clawd-on-desk>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/themes/clawd"

files="$(node -e '
const t = require(process.argv[1]);
const s = new Set([...Object.values(t.states), ...t.idleVariations.map((v) => v.file)]);
console.log([...s].join("\n"));
' "$dest/theme.json")"

missing=0
while IFS= read -r f; do
  if [[ ! "$f" =~ ^clawd-[a-z0-9-]+\.svg$ ]]; then
    echo "nome suspeito no theme.json: $f" >&2; exit 1
  fi
  if [[ -f "$src/assets/svg/$f" ]]; then
    cp "$src/assets/svg/$f" "$dest/$f"
    echo "ok     $f"
  else
    echo "FALTA  $f" >&2
    missing=1
  fi
done <<<"$files"
exit "$missing"
```

Run (o clone vai para o scratchpad, nunca é referenciado direto):

```bash
chmod +x scripts/import-clawd-assets.sh
CLONE="$(mktemp -d)/clawd-on-desk"
git clone --quiet https://github.com/rullerzhou-afk/clawd-on-desk "$CLONE"
git -C "$CLONE" checkout --quiet 0533435
./scripts/import-clawd-assets.sh "$CLONE"
ls themes/clawd/*.svg | wc -l
```

Expected: 19 linhas `ok`, nenhuma `FALTA`, e `19`.

- [ ] **Step 3: Licença**

`themes/clawd/NOTICE.md`:

```markdown
# Sprites do tema clawd

- Arte: **rullerzhou-afk**, projeto [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) (`assets/svg/`, commit `0533435`).
- Referência de pixel art: **clawd-tank** (@marciogranzotto).
- Uso **exclusivamente não comercial**, com permissão escrita do autor (ver `PERMISSION.md`).
- Clawd character is the property of Anthropic.

Estes SVGs não são cobertos por nenhuma licença deste repositório. Se o repositório
ficar público, eles só podem ir junto com este NOTICE, e nunca num produto comercial.
```

`themes/clawd/PERMISSION.md`: **pare e peça ao usuário** o link da conversa em que o autor liberou o uso e a data. Grave neste formato:

```markdown
# Permissão de uso dos sprites

- Autor: rullerzhou-afk
- Data: <data informada pelo usuário, AAAA-MM-DD>
- Link: <link informado pelo usuário>
- Escopo: uso não comercial dos SVGs de `assets/svg/` do clawd-on-desk no clawd-mini.

<trecho da resposta do autor, colado pelo usuário>
```

Se o usuário não tiver o link agora, crie o arquivo com as linhas que ele souber e deixe o item "PERMISSION.md completo" no resumo final da task como pendência explícita. Não invente data nem link.

- [ ] **Step 4: Teste do loader**

`test/theme.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadTheme, themeFiles, SPRITE_KEYS } from '../src/main/theme';
import { APP_ROOT } from '../src/main/paths';

const CLAWD = path.join(APP_ROOT, 'themes', 'clawd');

test('tema clawd: todos os estados e arquivos existem', () => {
  const t = loadTheme(CLAWD);
  for (const k of SPRITE_KEYS) assert.match(t.states[k], /^clawd-.*\.svg$/, k);
  assert.equal(themeFiles(t).length, 19);
  assert.equal(t.idleVariations.length, 3);
});

test('SVGs não têm script, handler de evento nem referência externa', () => {
  for (const f of themeFiles(loadTheme(CLAWD))) {
    const svg = fs.readFileSync(path.join(CLAWD, f), 'utf8');
    assert.equal(/<script/i.test(svg), false, `${f}: <script>`);
    assert.equal(/\son[a-z]+\s*=/i.test(svg), false, `${f}: on*=`);
    assert.equal(/(href|src)\s*=\s*["']\s*(https?:|\/\/)/i.test(svg), false, `${f}: ref externa`);
  }
});

function fakeTheme(states: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-theme-'));
  for (const f of new Set(Object.values(states))) {
    if (/^[\w.-]+$/.test(f)) fs.writeFileSync(path.join(dir, f), '<svg/>');
  }
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({ name: 'x', states, idleVariations: [] }));
  return dir;
}
const full = (): Record<string, string> => Object.fromEntries(SPRITE_KEYS.map((k) => [k, `clawd-${k}.svg`]));

test('loadTheme rejeita estado faltando', () => {
  const s = full();
  delete s.drag;
  assert.throws(() => loadTheme(fakeTheme(s)), /drag/);
});

test('loadTheme rejeita nome de arquivo suspeito', () => {
  assert.throws(() => loadTheme(fakeTheme({ ...full(), idle: '../x.svg' })), /idle/);
});

test('loadTheme acusa arquivo ausente', () => {
  const dir = fakeTheme(full());
  fs.unlinkSync(path.join(dir, 'clawd-error.svg'));
  assert.throws(() => loadTheme(dir), /clawd-error\.svg/);
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/main/theme'`.

- [ ] **Step 5: Implementar `src/main/theme.ts`**

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';

export const SPRITE_KEYS = [
  'idle', 'thinking', 'working', 'typing', 'building', 'juggling', 'juggling2', 'attention',
  'done', 'error', 'sweeping', 'yawning', 'dozing', 'collapsing', 'sleeping', 'waking', 'drag',
] as const;
export type SpriteKey = typeof SPRITE_KEYS[number];

export interface IdleVariation {
  file: string;
  durationMs: number;
}

export interface Theme {
  name: string;
  dir: string;
  states: Record<SpriteKey, string>;
  idleVariations: IdleVariation[];
}

const FILE_RE = /^clawd-[a-z0-9-]+\.svg$/;

export function loadTheme(dir: string): Theme {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')) as {
    name?: unknown;
    states?: Record<string, unknown>;
    idleVariations?: unknown;
  };

  const checkFile = (f: unknown, label: string): string => {
    if (typeof f !== 'string' || !FILE_RE.test(f)) throw new Error(`theme.json: "${label}" ausente ou inválido`);
    if (!fs.existsSync(path.join(dir, f))) {
      throw new Error(`tema: arquivo ${f} não existe em ${dir} (rode npm run import-assets)`);
    }
    return f;
  };

  const states = {} as Record<SpriteKey, string>;
  for (const k of SPRITE_KEYS) states[k] = checkFile(raw.states?.[k], k);

  const vars = Array.isArray(raw.idleVariations) ? raw.idleVariations : [];
  const idleVariations = vars.map((v: { file?: unknown; durationMs?: unknown }, i: number) => {
    if (typeof v.durationMs !== 'number' || v.durationMs <= 0) {
      throw new Error(`theme.json: idleVariations[${i}].durationMs inválido`);
    }
    return { file: checkFile(v.file, `idleVariations[${i}]`), durationMs: v.durationMs };
  });

  return { name: typeof raw.name === 'string' ? raw.name : path.basename(dir), dir, states, idleVariations };
}

export function themeFiles(t: Theme): string[] {
  return [...new Set([...Object.values(t.states), ...t.idleVariations.map((v) => v.file)])];
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: PASS. Se o teste de segurança dos SVGs falhar, **não** relaxe o teste: reporte qual arquivo e qual padrão ao usuário.

- [ ] **Step 7: Commit**

```bash
git add themes/clawd scripts/import-clawd-assets.sh src/main/theme.ts test/theme.test.ts
git commit -m "feat: tema clawd com importação dos SVGs, NOTICE e loader validado"
```

---

### Task 7: Apresentador (holds, idle com variação, sono, acordar, não perturbe)

**Files:**
- Create: `src/main/presenter.ts`, `test/presenter.test.ts`

**Interfaces:**
- Consumes: `Aggregate`, `BaseKey`, `PRIORITY`, `State` (Task 3); `Theme`, `SpriteKey` (Task 6).
- Produces:
  - `const SLEEP: { idleVariationAfterMs: 20000; yawnAfterMs: 60000; yawnMs: 3000; collapseAfterMs: 600000; collapseMs: number; wakeMs: 1500 }`
  - `class Presenter { constructor(theme: Theme, startedAt: number, random?: () => number); setDnd(on: boolean): void; tick(agg: Aggregate, now: number): string /* nome do SVG */ }`

- [ ] **Step 1: Calibrar a duração do colapso**

A spec não dá o tempo de `collapsing`. Leia a animação do SVG:

Run: `grep -oE 'animation[^;"}]*' themes/clawd/clawd-collapse-sleep.svg | sort -u`
Expected: uma ou mais durações (ex.: `2.4s ... forwards`). Use a maior duração **não** `infinite` como `collapseMs` no Step 3. Se todas forem `infinite`, use `3000` e anote isso no commit.

- [ ] **Step 2: Teste**

`test/presenter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Presenter, SLEEP } from '../src/main/presenter';
import { SPRITE_KEYS, SpriteKey, Theme, IdleVariation } from '../src/main/theme';
import type { Aggregate, BaseKey, State } from '../src/main/state-machine';

const T0 = 1_000_000;
const VARS: IdleVariation[] = [{ file: 'var-a.svg', durationMs: 1_000 }, { file: 'var-b.svg', durationMs: 2_000 }];

function theme(idleVariations: IdleVariation[] = VARS): Theme {
  const states = Object.fromEntries(SPRITE_KEYS.map((k) => [k, `${k}.svg`])) as Record<SpriteKey, string>;
  return { name: 't', dir: '/x', states, idleVariations };
}
function agg(state: State, lastEventAt: number, key: BaseKey = state): Aggregate {
  return { state, key, lastEventAt, active: state === 'idle' ? 0 : 1 };
}

test('estado não-idle mostra o sprite da variante', () => {
  const p = new Presenter(theme(), T0);
  assert.equal(p.tick(agg('working', T0, 'typing'), T0), 'typing.svg');
  assert.equal(p.tick(agg('juggling', T0, 'juggling2'), T0 + 10), 'juggling2.svg');
});

test('done fica 4 s mesmo se a sessão já voltou a idle', () => {
  const p = new Presenter(theme(), T0);
  assert.equal(p.tick(agg('done', T0), T0), 'done.svg');
  assert.equal(p.tick(agg('idle', T0), T0 + 1_000), 'done.svg');
  assert.equal(p.tick(agg('idle', T0), T0 + 3_999), 'done.svg');
  assert.equal(p.tick(agg('idle', T0), T0 + 4_000), 'idle.svg');
});

test('attention segura 5 s contra prioridade menor; error fura na hora', () => {
  const p = new Presenter(theme(), T0);
  p.tick(agg('attention', T0), T0);
  assert.equal(p.tick(agg('working', T0 + 500), T0 + 500), 'attention.svg');
  assert.equal(p.tick(agg('working', T0 + 500), T0 + 5_000), 'working.svg');

  const q = new Presenter(theme(), T0);
  q.tick(agg('attention', T0), T0);
  assert.equal(q.tick(agg('error', T0 + 600), T0 + 600), 'error.svg');
});

test('idle varia depois de 20 s, toca pela duração e volta', () => {
  const p = new Presenter(theme(), T0, () => 0.99); // índice 1 → var-b, 2 s
  const idle = agg('idle', 0);
  assert.equal(p.tick(idle, T0), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 19_999), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 20_000), 'var-b.svg');
  assert.equal(p.tick(idle, T0 + 21_999), 'var-b.svg');
  assert.equal(p.tick(idle, T0 + 22_000), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 41_999), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 42_000), 'var-b.svg');
});

test('random() === 1 não estoura o índice', () => {
  const p = new Presenter(theme(), T0, () => 1);
  assert.equal(p.tick(agg('idle', 0), T0 + 20_000), 'var-b.svg');
});

test('sem variações, idle nunca varia', () => {
  const p = new Presenter(theme([]), T0);
  assert.equal(p.tick(agg('idle', 0), T0 + 30_000), 'idle.svg');
});

test('sequência de sono e acordar', () => {
  const p = new Presenter(theme([]), T0);
  const idle = agg('idle', T0);
  assert.equal(p.tick(idle, T0 + SLEEP.yawnAfterMs - 1), 'idle.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.yawnAfterMs), 'yawning.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.yawnAfterMs + SLEEP.yawnMs), 'dozing.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.collapseAfterMs), 'collapsing.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.collapseAfterMs + SLEEP.collapseMs), 'sleeping.svg');

  const ev = T0 + SLEEP.collapseAfterMs + 100_000;
  assert.equal(p.tick(agg('thinking', ev), ev), 'waking.svg');
  assert.equal(p.tick(agg('thinking', ev), ev + SLEEP.wakeMs - 1), 'waking.svg');
  assert.equal(p.tick(agg('thinking', ev), ev + SLEEP.wakeMs), 'thinking.svg');
});

test('evento que chega como idle (SessionStart) também acorda', () => {
  const p = new Presenter(theme([]), T0);
  p.tick(agg('idle', T0), T0 + SLEEP.yawnAfterMs + SLEEP.yawnMs); // dozing
  const ev = T0 + 200_000;
  assert.equal(p.tick(agg('idle', ev), ev), 'waking.svg');
  assert.equal(p.tick(agg('idle', ev), ev + SLEEP.wakeMs), 'idle.svg');
});

test('não perturbe congela em sleeping; ao desligar, acorda se houve evento', () => {
  const p = new Presenter(theme(), T0);
  p.setDnd(true);
  assert.equal(p.tick(agg('attention', T0 + 10), T0 + 10), 'sleeping.svg');
  p.setDnd(false);
  assert.equal(p.tick(agg('attention', T0 + 10), T0 + 20), 'waking.svg');
  assert.equal(p.tick(agg('attention', T0 + 10), T0 + 20 + SLEEP.wakeMs), 'attention.svg');
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/main/presenter'`.

- [ ] **Step 4: Implementar**

`src/main/presenter.ts` (troque o valor de `collapseMs` pelo número calibrado no Step 1):

```ts
import { PRIORITY, State } from './state-machine';
import type { Aggregate } from './state-machine';
import type { SpriteKey, Theme } from './theme';

export const SLEEP = {
  idleVariationAfterMs: 20_000,
  yawnAfterMs: 60_000,
  yawnMs: 3_000,
  collapseAfterMs: 10 * 60_000,
  collapseMs: 3_000, // calibrado pelo @keyframes de clawd-collapse-sleep.svg
  wakeMs: 1_500,
} as const;

// Tempo mínimo na tela; só um estado de prioridade maior interrompe antes.
const MIN_HOLD: Partial<Record<SpriteKey, number>> = { done: 4_000, error: 5_000, attention: 5_000 };
const SLEEPY: ReadonlySet<SpriteKey> = new Set<SpriteKey>(['yawning', 'dozing', 'collapsing', 'sleeping']);

function keyPriority(k: SpriteKey): number {
  if (k === 'typing' || k === 'building') return PRIORITY.working;
  if (k === 'juggling2') return PRIORITY.juggling;
  return Object.prototype.hasOwnProperty.call(PRIORITY, k) ? PRIORITY[k as State] : 0;
}

export class Presenter {
  private lastEventAt: number;
  private key: SpriteKey | null = null;
  private keySince = 0;
  private idleSince: number;
  private wakeUntil = 0;
  private variation: { file: string; until: number } | null = null;
  private dnd = false;

  constructor(
    private readonly theme: Theme,
    startedAt: number,
    private readonly random: () => number = Math.random,
  ) {
    this.lastEventAt = startedAt;
    this.idleSince = startedAt;
  }

  setDnd(on: boolean): void {
    this.dnd = on;
  }

  tick(agg: Aggregate, now: number): string {
    if (this.dnd) return this.show('sleeping', now);

    if (agg.lastEventAt > this.lastEventAt) {
      this.lastEventAt = agg.lastEventAt;
      if (this.key && SLEEPY.has(this.key)) this.wakeUntil = now + SLEEP.wakeMs;
    }
    if (now < this.wakeUntil) return this.show('waking', now);

    let target: SpriteKey = agg.state === 'idle' ? this.idleKey(now) : agg.key;
    const current = this.key;
    const hold = current ? MIN_HOLD[current] : undefined;
    if (current && hold !== undefined && target !== current && now - this.keySince < hold
        && keyPriority(target) <= keyPriority(current)) {
      target = current;
    }

    if (target === 'idle') return this.idleFile(now);
    this.variation = null;
    return this.show(target, now);
  }

  private idleKey(now: number): SpriteKey {
    const t = now - this.lastEventAt;
    if (t >= SLEEP.collapseAfterMs + SLEEP.collapseMs) return 'sleeping';
    if (t >= SLEEP.collapseAfterMs) return 'collapsing';
    if (t >= SLEEP.yawnAfterMs + SLEEP.yawnMs) return 'dozing';
    if (t >= SLEEP.yawnAfterMs) return 'yawning';
    return 'idle';
  }

  private idleFile(now: number): string {
    const base = this.show('idle', now);
    if (this.variation) {
      if (now < this.variation.until) return this.variation.file;
      this.variation = null;
      this.idleSince = now;
    }
    const vars = this.theme.idleVariations;
    if (vars.length > 0 && now - this.idleSince >= SLEEP.idleVariationAfterMs) {
      const v = vars[Math.min(vars.length - 1, Math.floor(this.random() * vars.length))];
      this.variation = { file: v.file, until: now + v.durationMs };
      return v.file;
    }
    return base;
  }

  private show(key: SpriteKey, now: number): string {
    if (key !== this.key) {
      this.key = key;
      this.keySince = now;
      if (key === 'idle') this.idleSince = now;
    }
    return this.theme.states[key];
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/presenter.ts test/presenter.test.ts
git commit -m "feat: apresentador com one-shots, variações de idle, sono e não perturbe"
```

---

### Task 8: Renderer com sprites (Fases 2 e 3 na tela)

**Files:**
- Modify: `src/main/main.ts` (reescrever), `src/preload.ts` (reescrever), `src/renderer/index.html` (reescrever), `src/renderer/renderer.ts` (reescrever), `src/renderer/style.css` (reescrever)

**Interfaces:**
- Consumes: `Presenter` (Task 7), `loadTheme`, `themeFiles` (Task 6), `aggregate` (Task 3), `watchSessions` (Task 4), `createPetWindow` (Task 5).
- Produces:
  - IPC `sprite` (main → renderer, payload: nome do SVG, ex. `clawd-happy.svg`).
  - IPC `theme:info` (invoke) → `{ files: string[]; drag: string }`.
  - `window.clawd.onSprite(cb)`, `window.clawd.themeInfo()`.

- [ ] **Step 1: `src/preload.ts`**

```ts
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('clawd', {
  onSprite: (cb: (file: string) => void): void => {
    ipcRenderer.on('sprite', (_e, file: string) => cb(file));
  },
  themeInfo: (): Promise<{ files: string[]; drag: string }> => ipcRenderer.invoke('theme:info'),
});
```

- [ ] **Step 2: Renderer**

`src/renderer/index.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <img id="pet" alt="" draggable="false">
  <script src="../../dist/src/renderer/renderer.js"></script>
</body>
</html>
```

`src/renderer/style.css`:

```css
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  user-select: none;
}

#pet {
  display: block;
  width: 100%;
  height: 100%;
  -webkit-user-drag: none;
}
```

`src/renderer/renderer.ts`:

```ts
interface ThemeInfo {
  files: string[];
  drag: string;
}
interface ClawdApi {
  onSprite(cb: (file: string) => void): void;
  themeInfo(): Promise<ThemeInfo>;
}
interface Window {
  clawd: ClawdApi;
}

const THEME_BASE = '../../themes/clawd/';
const pet = document.getElementById('pet') as HTMLImageElement;
const preloaded: HTMLImageElement[] = []; // referência mantida para o cache não ser coletado

function showSprite(file: string): void {
  const src = THEME_BASE + file;
  // Trocar o src reinicia a animação CSS do SVG, que é o comportamento desejado.
  if (pet.getAttribute('src') !== src) pet.src = src;
}

window.clawd.onSprite(showSprite);

void window.clawd.themeInfo().then((info) => {
  for (const f of info.files) {
    const img = new Image();
    img.src = THEME_BASE + f;
    preloaded.push(img);
  }
});
```

- [ ] **Step 3: `src/main/main.ts`**

```ts
import { app, dialog, ipcMain, screen } from 'electron';
import * as path from 'node:path';
import { createPetWindow } from './window';
import { watchSessions } from './watcher';
import { aggregate, SessionRecord } from './state-machine';
import { Presenter } from './presenter';
import { loadTheme, themeFiles, Theme } from './theme';
import { APP_ROOT, SESSIONS_DIR } from './paths';

const TICK_MS = 250;
const SIZE = 160;

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);

function start(): void {
  let theme: Theme;
  try {
    theme = loadTheme(path.join(APP_ROOT, 'themes', 'clawd'));
  } catch (err) {
    dialog.showErrorBox('clawd-mini', err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }

  const wa = screen.getPrimaryDisplay().workArea;
  const win = createPetWindow({ x: wa.x + wa.width - SIZE - 16, y: wa.y + wa.height - SIZE - 16, size: SIZE });
  const presenter = new Presenter(theme, Date.now());
  ipcMain.handle('theme:info', () => ({ files: themeFiles(theme), drag: theme.states.drag }));

  let records: SessionRecord[] = [];
  let shown = '';
  const render = (): void => {
    if (win.isDestroyed()) return;
    const now = Date.now();
    const file = presenter.tick(aggregate(records, now), now);
    if (file !== shown) {
      shown = file;
      win.webContents.send('sprite', file);
    }
  };
  win.webContents.on('did-finish-load', () => { shown = ''; render(); });
  watchSessions(SESSIONS_DIR, (r) => { records = r; render(); });
  setInterval(render, TICK_MS);
}
```

(Se na Task 5 foi preciso o `setTimeout(start, 300)` por causa do fundo preto, mantenha aqui também.)

- [ ] **Step 4: Build + testes**

Run: `npm test`
Expected: compila e todos PASS.

- [ ] **Step 5: Verificação manual**

Run: `npm start` e, em outro terminal, `./scripts/simulate.sh`
Expected, conferindo com o mapa da spec (seção 5):
- cada evento troca para o sprite certo, sem piscar (pré-carga);
- as animações internas dos SVGs rodam;
- `error` fica 5 s, `done` fica 4 s e vira `idle`;
- `attention` da sessão b vence `working` da sessão a;
- fundo transparente, clawd com ~80 px de corpo, efeitos (bolas, vassoura) sem corte.

Depois, sem mexer em nada:
- ~20 s parado → uma variação de idle (look/bubble/reading), depois volta.
- 60 s → bocejo e cochilo. (Para testar os 10 min sem esperar, rode uma vez com `SLEEP.collapseAfterMs` temporariamente em `30_000`, confira `collapsing → sleeping`, **reverta**.)
- Com o pet dormindo, rode `PAUSE=1 ./scripts/simulate.sh` → animação `waking` antes do novo estado.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: renderer com sprites SVG, pré-carga e apresentador ligado"
```

---

### Task 9: Posição salva + arrastar

**Files:**
- Create: `src/main/prefs.ts`, `src/main/drag.ts`, `test/prefs.test.ts`, `test/drag.test.ts`
- Modify: `src/main/main.ts` (reescrever), `src/preload.ts` (reescrever), `src/renderer/renderer.ts` (reescrever)

**Interfaces:**
- Consumes: `PREFS_FILE` (Task 5), tudo da Task 8.
- Produces:
  - `prefs.ts`: `interface Prefs { x?: number; y?: number; size: number }`, `interface Rect { x: number; y: number; width: number; height: number }`, `DEFAULT_SIZE = 160`, `loadPrefs(file: string): Prefs`, `savePrefs(file: string, prefs: Prefs): void`, `resolvePosition(p: Prefs, workAreas: Rect[], primary: Rect): { x: number; y: number }`.
  - `drag.ts`: `isFinitePoint(x: unknown, y: unknown): x is number` (checa os dois), `dragTarget(start: { sx: number; sy: number; wx: number; wy: number }, sx: number, sy: number): { x: number; y: number }`, `installDrag(win: BrowserWindow, onDrop: (x: number, y: number) => void): void`.
  - IPC renderer → main: `drag:start (screenX, screenY)`, `drag:move (screenX, screenY)`, `drag:end`.

- [ ] **Step 1: Testes**

`test/prefs.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_SIZE, loadPrefs, resolvePosition, savePrefs } from '../src/main/prefs';

function tmpFile(content?: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-prefs-')), 'sub', 'prefs.json');
  if (content !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return file;
}

test('arquivo ausente ou corrompido → defaults', () => {
  assert.deepEqual(loadPrefs(tmpFile()), { size: DEFAULT_SIZE });
  assert.deepEqual(loadPrefs(tmpFile('{"x": 1')), { size: DEFAULT_SIZE });
  assert.deepEqual(loadPrefs(tmpFile('null')), { size: DEFAULT_SIZE });
});

test('valores lixo são descartados; size é limitado', () => {
  assert.deepEqual(loadPrefs(tmpFile('{"size":"abc","x":null,"y":5}')), { size: DEFAULT_SIZE });
  assert.deepEqual(loadPrefs(tmpFile('{"size":10}')), { size: 64 });
  assert.deepEqual(loadPrefs(tmpFile('{"size":9999}')), { size: 512 });
  assert.deepEqual(loadPrefs(tmpFile('{"size":200.4,"x":10.6,"y":-3}')), { size: 200, x: 11, y: -3 });
});

test('savePrefs grava atômico com 0600 e relê igual', () => {
  const file = tmpFile();
  savePrefs(file, { x: 100, y: 200, size: 160 });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(loadPrefs(file), { x: 100, y: 200, size: 160 });
  assert.equal(fs.readdirSync(path.dirname(file)).some((f) => f.endsWith('.tmp')), false);
});

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 };
const SECOND = { x: 1920, y: 0, width: 1280, height: 1024 };

test('posição dentro de alguma tela é mantida', () => {
  assert.deepEqual(resolvePosition({ x: 2000, y: 100, size: 160 }, [PRIMARY, SECOND], PRIMARY), { x: 2000, y: 100 });
});

test('posição fora de qualquer tela (monitor desconectado) → canto inferior direito da principal', () => {
  const br = { x: 1920 - 160 - 16, y: 1040 - 160 - 16 };
  assert.deepEqual(resolvePosition({ x: 2000, y: 100, size: 160 }, [PRIMARY], PRIMARY), br);
  assert.deepEqual(resolvePosition({ size: 160 }, [PRIMARY], PRIMARY), br);
});
```

`test/drag.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragTarget, isFinitePoint } from '../src/main/drag';

test('dragTarget desloca a janela pelo movimento do ponteiro', () => {
  assert.deepEqual(dragTarget({ sx: 500, sy: 500, wx: 100, wy: 200 }, 530, 480), { x: 130, y: 180 });
  assert.deepEqual(dragTarget({ sx: 0, sy: 0, wx: 0, wy: 0 }, 1.6, 2.4), { x: 2, y: 2 });
});

test('isFinitePoint recusa lixo vindo do IPC', () => {
  assert.equal(isFinitePoint(1, 2), true);
  for (const [x, y] of [[NaN, 1], [1, Infinity], ['1', 2], [null, 2], [undefined, undefined], [{}, 1]]) {
    assert.equal(isFinitePoint(x, y), false, `${String(x)},${String(y)}`);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — módulos `prefs` e `drag` não existem.

- [ ] **Step 3: `src/main/prefs.ts`**

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Prefs {
  x?: number;
  y?: number;
  size: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_SIZE = 160;
const MIN_SIZE = 64;
const MAX_SIZE = 512;
const MARGIN = 16;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function loadPrefs(file: string): Prefs {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { size: DEFAULT_SIZE }; }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const prefs: Prefs = {
    size: isNum(o.size) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(o.size))) : DEFAULT_SIZE,
  };
  if (isNum(o.x) && isNum(o.y)) {
    prefs.x = Math.round(o.x);
    prefs.y = Math.round(o.y);
  }
  return prefs;
}

export function savePrefs(file: string, prefs: Prefs): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function resolvePosition(p: Prefs, workAreas: Rect[], primary: Rect): { x: number; y: number } {
  if (p.x !== undefined && p.y !== undefined) {
    const cx = p.x + p.size / 2;
    const cy = p.y + p.size / 2;
    const visible = workAreas.some((a) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height);
    if (visible) return { x: p.x, y: p.y };
  }
  return { x: primary.x + primary.width - p.size - MARGIN, y: primary.y + primary.height - p.size - MARGIN };
}
```

- [ ] **Step 4: `src/main/drag.ts`**

```ts
import { BrowserWindow, ipcMain } from 'electron';

interface DragStart {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
}

export function isFinitePoint(x: unknown, y: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y);
}

export function dragTarget(start: DragStart, sx: number, sy: number): { x: number; y: number } {
  return { x: Math.round(start.wx + sx - start.sx), y: Math.round(start.wy + sy - start.sy) };
}

// -webkit-app-region: drag não gera eventos de mouse no renderer, então o arraste é manual.
export function installDrag(win: BrowserWindow, onDrop: (x: number, y: number) => void): void {
  let start: DragStart | null = null;
  const fromPet = (e: Electron.IpcMainEvent): boolean => e.sender === win.webContents;

  ipcMain.on('drag:start', (e, sx: unknown, sy: unknown) => {
    if (!fromPet(e) || !isFinitePoint(sx, sy)) return;
    const [wx, wy] = win.getPosition();
    start = { sx, sy: sy as number, wx, wy };
  });
  ipcMain.on('drag:move', (e, sx: unknown, sy: unknown) => {
    if (!start || !fromPet(e) || !isFinitePoint(sx, sy)) return;
    const p = dragTarget(start, sx, sy as number);
    win.setPosition(p.x, p.y);
  });
  ipcMain.on('drag:end', (e) => {
    if (!start || !fromPet(e)) return;
    start = null;
    const [x, y] = win.getPosition();
    onDrop(x, y);
  });
}
```

Run: `npm test`
Expected: PASS em `prefs.test.ts` e `drag.test.ts`.

- [ ] **Step 5: `src/preload.ts`**

```ts
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('clawd', {
  onSprite: (cb: (file: string) => void): void => {
    ipcRenderer.on('sprite', (_e, file: string) => cb(file));
  },
  themeInfo: (): Promise<{ files: string[]; drag: string }> => ipcRenderer.invoke('theme:info'),
  dragStart: (x: number, y: number): void => ipcRenderer.send('drag:start', x, y),
  dragMove: (x: number, y: number): void => ipcRenderer.send('drag:move', x, y),
  dragEnd: (): void => ipcRenderer.send('drag:end'),
});
```

- [ ] **Step 6: `src/renderer/renderer.ts`**

```ts
interface ThemeInfo {
  files: string[];
  drag: string;
}
interface ClawdApi {
  onSprite(cb: (file: string) => void): void;
  themeInfo(): Promise<ThemeInfo>;
  dragStart(x: number, y: number): void;
  dragMove(x: number, y: number): void;
  dragEnd(): void;
}
interface Window {
  clawd: ClawdApi;
}

const THEME_BASE = '../../themes/clawd/';
const pet = document.getElementById('pet') as HTMLImageElement;
const preloaded: HTMLImageElement[] = []; // referência mantida para o cache não ser coletado
let currentFile = '';
let dragFile = '';
let dragging = false;

function showSprite(file: string): void {
  const src = THEME_BASE + file;
  // Trocar o src reinicia a animação CSS do SVG, que é o comportamento desejado.
  if (pet.getAttribute('src') !== src) pet.src = src;
}

window.clawd.onSprite((file) => {
  currentFile = file;
  if (!dragging) showSprite(file);
});

void window.clawd.themeInfo().then((info) => {
  dragFile = info.drag;
  for (const f of info.files) {
    const img = new Image();
    img.src = THEME_BASE + f;
    preloaded.push(img);
  }
});

pet.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  pet.setPointerCapture(e.pointerId);
  window.clawd.dragStart(e.screenX, e.screenY);
  if (dragFile) showSprite(dragFile);
});

pet.addEventListener('pointermove', (e) => {
  if (dragging) window.clawd.dragMove(e.screenX, e.screenY);
});

function endDrag(): void {
  if (!dragging) return;
  dragging = false;
  window.clawd.dragEnd();
  if (currentFile) showSprite(currentFile);
}
pet.addEventListener('pointerup', endDrag);
pet.addEventListener('pointercancel', endDrag);
pet.addEventListener('contextmenu', (e) => e.preventDefault()); // clique-direito desligado na v1
```

- [ ] **Step 7: `src/main/main.ts`**

```ts
import { app, dialog, ipcMain, screen } from 'electron';
import * as path from 'node:path';
import { createPetWindow } from './window';
import { watchSessions } from './watcher';
import { aggregate, SessionRecord } from './state-machine';
import { Presenter } from './presenter';
import { loadTheme, themeFiles, Theme } from './theme';
import { loadPrefs, Prefs, Rect, resolvePosition, savePrefs } from './prefs';
import { installDrag } from './drag';
import { APP_ROOT, PREFS_FILE, SESSIONS_DIR } from './paths';

const TICK_MS = 250;

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);

function workAreas(): Rect[] {
  return screen.getAllDisplays().map((d) => d.workArea);
}

function persist(prefs: Prefs): void {
  try {
    savePrefs(PREFS_FILE, prefs);
  } catch (err) {
    console.warn('clawd-mini: não consegui salvar prefs', err);
  }
}

function start(): void {
  let theme: Theme;
  try {
    theme = loadTheme(path.join(APP_ROOT, 'themes', 'clawd'));
  } catch (err) {
    dialog.showErrorBox('clawd-mini', err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }

  let prefs = loadPrefs(PREFS_FILE);
  const pos = resolvePosition(prefs, workAreas(), screen.getPrimaryDisplay().workArea);
  const win = createPetWindow({ ...pos, size: prefs.size });
  const presenter = new Presenter(theme, Date.now());

  ipcMain.handle('theme:info', () => ({ files: themeFiles(theme), drag: theme.states.drag }));
  installDrag(win, (x, y) => {
    prefs = { ...prefs, x, y };
    persist(prefs);
  });

  let records: SessionRecord[] = [];
  let shown = '';
  const render = (): void => {
    if (win.isDestroyed()) return;
    const now = Date.now();
    const file = presenter.tick(aggregate(records, now), now);
    if (file !== shown) {
      shown = file;
      win.webContents.send('sprite', file);
    }
  };
  win.webContents.on('did-finish-load', () => { shown = ''; render(); });
  watchSessions(SESSIONS_DIR, (r) => { records = r; render(); });
  setInterval(render, TICK_MS);
}
```

(Mantenha o `setTimeout(start, 300)` se ele foi necessário na Task 5.)

- [ ] **Step 8: Build + testes + verificação manual**

Run: `npm test`
Expected: PASS.

Run: `npm start`
Expected:
- arrastar o pet move a janela suavemente e mostra o sprite `drag`; ao soltar volta ao estado atual;
- `cat ~/.clawd-mini/prefs.json` tem `x`/`y` novos;
- fechar (`Ctrl+C`) e `npm start` de novo → mesma posição;
- editar `prefs.json` com `"x": 99999` → abre no canto inferior direito;
- editar `"size": 120` → janela e sprite em 120 px.

- [ ] **Step 9: Commit**

```bash
git add src test/prefs.test.ts test/drag.test.ts
git commit -m "feat: arrastar o pet com sprite drag e posição salva"
```

---

### Task 10: Tray

**Files:**
- Create: `src/main/tray.ts`, `assets/tray.png`
- Modify: `src/main/main.ts`

**Interfaces:**
- Consumes: `Presenter.setDnd` (Task 7), `resolvePosition`, `savePrefs` (Task 9).
- Produces: `interface TrayActions { isVisible(): boolean; toggleVisible(): void; isDnd(): boolean; setDnd(on: boolean): void; resetPosition(): void; quit(): void }`, `createTray(iconPath: string, a: TrayActions): Tray | null`.

- [ ] **Step 1: Ícone do tray**

O `nativeImage` do Electron não lê SVG. Gere um PNG recortando o viewBox no corpo do clawd (corpo em `x -4..19`, `y -3..17`):

```bash
command -v rsvg-convert
grep -c 'viewBox="-15 -25 45 45"' themes/clawd/clawd-idle-follow.svg
mkdir -p assets
sed 's/viewBox="-15 -25 45 45"/viewBox="-7.5 -8 30 30"/' themes/clawd/clawd-idle-follow.svg > "$(mktemp -d)/tray.svg"
```

Se `rsvg-convert` não existir, **pare e peça ao usuário** para rodar `sudo apt install librsvg2-bin` (o executor não usa sudo). Com ele instalado:

```bash
T="$(mktemp -d)"
sed 's/viewBox="-15 -25 45 45"/viewBox="-7.5 -8 30 30"/' themes/clawd/clawd-idle-follow.svg > "$T/tray.svg"
rsvg-convert -w 32 -h 32 "$T/tray.svg" -o assets/tray.png
file assets/tray.png
```

Expected: `grep -c` imprime `1`; `file` diz `PNG image data, 32 x 32`. Abra o PNG e confira que o clawd aparece inteiro e centralizado.

Acrescente ao fim de `themes/clawd/NOTICE.md`:

```markdown

`assets/tray.png` é derivado de `clawd-idle-follow.svg` e segue as mesmas condições.
```

- [ ] **Step 2: `src/main/tray.ts`**

```ts
import { Menu, nativeImage, Tray } from 'electron';

export interface TrayActions {
  isVisible(): boolean;
  toggleVisible(): void;
  isDnd(): boolean;
  setDnd(on: boolean): void;
  resetPosition(): void;
  quit(): void;
}

// No GNOME o tray depende da extensão AppIndicator. Sem ela, o app segue sem tray.
export function createTray(iconPath: string, a: TrayActions): Tray | null {
  let tray: Tray;
  try {
    tray = new Tray(nativeImage.createFromPath(iconPath));
  } catch (err) {
    console.warn('clawd-mini: tray indisponível', err);
    return null;
  }
  tray.setToolTip('clawd-mini');
  const rebuild = (): void => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: a.isVisible() ? 'Esconder' : 'Mostrar', click: () => { a.toggleVisible(); rebuild(); } },
      { label: 'Não perturbe', type: 'checkbox', checked: a.isDnd(), click: (item) => { a.setDnd(item.checked); rebuild(); } },
      { label: 'Resetar posição', click: () => a.resetPosition() },
      { type: 'separator' },
      { label: 'Sair', click: () => a.quit() },
    ]));
  };
  rebuild();
  return tray;
}
```

- [ ] **Step 3: Ligar no `main.ts`**

Edit 1 — imports. Trocar:

```ts
import { app, dialog, ipcMain, screen } from 'electron';
```

por:

```ts
import { app, dialog, ipcMain, screen, Tray } from 'electron';
```

e trocar:

```ts
import { installDrag } from './drag';
```

por:

```ts
import { installDrag } from './drag';
import { createTray } from './tray';
```

Edit 2 — referência global (evita o tray ser coletado). Trocar:

```ts
const TICK_MS = 250;
```

por:

```ts
const TICK_MS = 250;
let tray: Tray | null = null;
```

Edit 3 — criar o tray. Trocar:

```ts
  watchSessions(SESSIONS_DIR, (r) => { records = r; render(); });
  setInterval(render, TICK_MS);
}
```

por:

```ts
  watchSessions(SESSIONS_DIR, (r) => { records = r; render(); });
  setInterval(render, TICK_MS);

  let dnd = false;
  tray = createTray(path.join(APP_ROOT, 'assets', 'tray.png'), {
    isVisible: () => win.isVisible(),
    toggleVisible: () => (win.isVisible() ? win.hide() : win.showInactive()),
    isDnd: () => dnd,
    setDnd: (on) => {
      dnd = on;
      presenter.setDnd(on);
      render();
    },
    resetPosition: () => {
      prefs = { size: prefs.size };
      persist(prefs);
      const p = resolvePosition(prefs, workAreas(), screen.getPrimaryDisplay().workArea);
      win.setPosition(p.x, p.y);
    },
    quit: () => app.quit(),
  });
}
```

- [ ] **Step 4: Build + testes + verificação manual**

Run: `npm test`
Expected: PASS (nada novo testado automaticamente; garante que compila).

Run: `npm start`
Expected, com a extensão `ubuntu-appindicators` ativa (está nesta máquina):
- ícone do clawd na barra superior;
- **Esconder** some com o pet; o item vira **Mostrar** e traz de volta;
- **Não perturbe** marcado → pet dorme e fica dormindo mesmo com `./scripts/simulate.sh` rodando; desmarcar → acorda (`waking`) e mostra o estado atual;
- **Resetar posição** → volta ao canto inferior direito e `prefs.json` perde `x`/`y`;
- **Sair** fecha o app.

Teste de degradação: `gnome-extensions disable ubuntu-appindicators@ubuntu.com`, `npm start` → pet funciona sem tray e sem erro fatal. Reative com `gnome-extensions enable ubuntu-appindicators@ubuntu.com`.

- [ ] **Step 5: Commit**

```bash
git add src/main/tray.ts src/main/main.ts assets/tray.png themes/clawd/NOTICE.md
git commit -m "feat: tray com esconder, não perturbe, resetar posição e sair"
```

---

### Task 11: Autostart

**Files:**
- Create: `scripts/install-autostart.js`, `test/autostart.test.ts`

**Interfaces:**
- Consumes: `scripts/start.js` (Task 5).
- Produces: `scripts/install-autostart.js` exporta `desktopEntry(nodePath: string, startJs: string): string` e `autostartFile(env: NodeJS.ProcessEnv, home: string): string`. CLI: sem args instala; `--uninstall` remove.

- [ ] **Step 1: Teste**

`test/autostart.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

interface Autostart {
  desktopEntry(nodePath: string, startJs: string): string;
  autostartFile(env: NodeJS.ProcessEnv, home: string): string;
}
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'install-autostart.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const as: Autostart = require(SCRIPT);

test('desktopEntry chama o start.js com o node absoluto e aspas escapadas', () => {
  const d = as.desktopEntry('/n/node', '/repo com espaço/scripts/start.js');
  assert.match(d, /^\[Desktop Entry\]$/m);
  assert.match(d, /^Exec="\/n\/node" "\/repo com espaço\/scripts\/start\.js"$/m);
  assert.match(d, /^X-GNOME-Autostart-enabled=true$/m);
  assert.equal(as.desktopEntry('/n/node', '/a"b$c').includes('Exec="/n/node" "/a\\"b\\$c"'), true);
});

test('autostartFile respeita XDG_CONFIG_HOME', () => {
  assert.equal(as.autostartFile({}, '/h'), '/h/.config/autostart/clawd-mini.desktop');
  assert.equal(as.autostartFile({ XDG_CONFIG_HOME: '/x' }, '/h'), '/x/autostart/clawd-mini.desktop');
});

test('CLI instala e desinstala', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-auto-'));
  const env = { ...process.env, XDG_CONFIG_HOME: cfg };
  const file = path.join(cfg, 'autostart', 'clawd-mini.desktop');
  assert.equal(spawnSync(process.execPath, [SCRIPT], { env }).status, 0);
  assert.ok(fs.existsSync(file));
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--uninstall'], { env }).status, 0);
  assert.equal(fs.existsSync(file), false);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--uninstall'], { env }).status, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/install-autostart.js'`.

- [ ] **Step 3: Implementar**

`scripts/install-autostart.js`:

```js
#!/usr/bin/env node
// Cria/remove ~/.config/autostart/clawd-mini.desktop.
// O Exec chama scripts/start.js, que aplica --ozone-platform=x11 com a guarda do $DISPLAY.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function dq(s) {
  return '"' + s.replace(/([\\"`$])/g, '\\$1') + '"';
}

function desktopEntry(nodePath, startJs) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=clawd-mini',
    'Comment=Mascote que reage ao Claude Code',
    `Exec=${dq(nodePath)} ${dq(startJs)}`,
    'Terminal=false',
    'NoDisplay=true',
    'X-GNOME-Autostart-enabled=true',
    'X-GNOME-Autostart-Delay=5',
    '',
  ].join('\n');
}

function autostartFile(env, home) {
  const base = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(base, 'autostart', 'clawd-mini.desktop');
}

module.exports = { desktopEntry, autostartFile };

if (require.main === module) {
  const file = autostartFile(process.env, os.homedir());
  if (process.argv.includes('--uninstall')) {
    fs.rmSync(file, { force: true });
    console.log(`removido: ${file}`);
  } else {
    const startJs = path.resolve(__dirname, 'start.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, desktopEntry(process.execPath, startJs));
    console.log(`criado: ${file}\nRode \`npm run build\` antes do próximo login (o autostart não compila).`);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verificação manual**

Run: `npm run build && npm run install-autostart && cat ~/.config/autostart/clawd-mini.desktop`
Expected: `Exec=` com o node absoluto e o `start.js` do repo.

**Peça ao usuário** para sair e entrar de novo na sessão (ou reiniciar). Expected: o pet aparece sozinho ~5 s depois do login, na posição salva.

Run: `npm run uninstall-autostart`
Expected: arquivo removido.

- [ ] **Step 6: Commit**

```bash
git add scripts/install-autostart.js test/autostart.test.ts
git commit -m "feat: autostart via .desktop"
```

---

### Task 12: README e checklist final

**Files:**
- Create: `README.md`

- [ ] **Step 1: `README.md`**

````markdown
# clawd-mini

Mascote de desktop que reage ao que o Claude Code está fazendo (CLI e Claude Desktop).
Só animação: sem rede, sem porta, sem permissões, sem ler transcript. Detalhes em [SPEC.md](SPEC.md).

## Instalar

```bash
npm install
npm run import-assets -- <clone-do-clawd-on-desk>   # só se themes/clawd/*.svg não existir
npm start
```

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

## Problemas conhecidos

- **Fundo preto em vez de transparente:** a criação da janela precisa de atraso (`setTimeout(start, 300)` em `src/main/main.ts`).
- **Sem ícone na barra:** no GNOME o tray exige a extensão AppIndicator. O pet funciona sem ela.
- **Wayland:** o launcher força XWayland (`--ozone-platform=x11`) quando há `$DISPLAY`. Em Wayland sem XWayland o pet não consegue se posicionar nem ficar por cima.

## Licença dos sprites

Os SVGs em `themes/clawd/` são arte de rullerzhou-afk (clawd-on-desk), usados com permissão
para fins **não comerciais**. Veja [themes/clawd/NOTICE.md](themes/clawd/NOTICE.md).
Clawd character is the property of Anthropic.
````

Se na Task 5 o `setTimeout` **não** foi necessário, apague esse item de "Problemas conhecidos" e deixe só a frase "Se aparecer fundo preto, crie a janela com atraso: `setTimeout(start, 300)` em `src/main/main.ts`."

- [ ] **Step 2: Rodar o checklist da spec (seção 7) inteiro**

Com `npm start` e os hooks registrados, marque cada item e anote o resultado real:

- [ ] Cada evento troca para o sprite esperado (`./scripts/simulate.sh`).
- [ ] Duas sessões: `attention` numa e `working` na outra → mostra `attention`.
- [ ] `Stop` → `done` por 4 s → `idle`. (A spec diz 3 s no checklist e 4 s no corpo; vale 4 s.)
- [ ] Sem eventos por 60 s → bocejo; por 10 min → dorme; um evento → acorda.
- [ ] Matar o Claude sem `SessionEnd` (`kill -9` no processo do CLI) → a sessão some do cálculo em 10 min.
- [ ] Com o app fechado, o Claude funciona normal e o hook não gera erro visível.
- [ ] Arrastar, fechar e reabrir → mesma posição.
- [ ] Funciona com sessão do Claude Desktop (aba Code) e com o CLI.
- [ ] Hook com stdin vazio ou JSON inválido → sai com 0, sem escrever (coberto por teste + simulate).
- [ ] Tempo do hook < 100 ms (coluna de ms do `simulate.sh`; anote a mediana real).

Qualquer item que falhar vira bug: use superpowers:systematic-debugging antes de mexer.

- [ ] **Step 3: Commit e push**

```bash
git add README.md
git commit -m "docs: README com instalação, hooks, autostart e licença dos sprites"
git push
```
