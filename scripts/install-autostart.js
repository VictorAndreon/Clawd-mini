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
