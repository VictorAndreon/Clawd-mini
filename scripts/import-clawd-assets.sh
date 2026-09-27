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
