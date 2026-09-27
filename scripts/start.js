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
