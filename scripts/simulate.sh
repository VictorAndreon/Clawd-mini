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
t0=$(date +%s%N); node "$HOOK" Stop < <(sleep 3); t1=$(date +%s%N)
echo "stdin sem fim    → exit $? em $(( (t1 - t0) / 1000000 )) ms (esperado ~1000)"

send sim-a SessionEnd
echo "fim. ~/.clawd-mini/sessions deve estar vazio:"
ls -A "${CLAWD_MINI_HOME:-$HOME/.clawd-mini}/sessions"
