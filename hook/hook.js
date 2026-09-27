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
