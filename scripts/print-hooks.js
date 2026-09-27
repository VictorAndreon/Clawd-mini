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
