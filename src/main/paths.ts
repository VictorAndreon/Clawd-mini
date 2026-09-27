import * as os from 'node:os';
import * as path from 'node:path';

// dist/src/main/paths.js -> raiz do repo
export const APP_ROOT = path.resolve(__dirname, '..', '..', '..');

export function clawdHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWD_MINI_HOME || path.join(os.homedir(), '.clawd-mini');
}

export const SESSIONS_DIR = path.join(clawdHome(), 'sessions');
export const PREFS_FILE = path.join(clawdHome(), 'prefs.json');
