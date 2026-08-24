#!/usr/bin/env bash
# PreToolUse gate for `gh pr create` / `git push`.
#
# Registered on matcher "Bash" with NO `if` filter: this repo's harness build
# evaluates hook `if` patterns unreliably against compound/subshell commands
# (false-fires on things like `{ ...; } | shasum` that contain neither "git
# push" nor "gh pr create" — verified empirically, not a hunch). So instead
# this script reads the real command straight from the hook's stdin JSON and
# does its own literal match; every non-matching Bash call exits 0 immediately.
#
# Blocks a real match unless .claude/pr-self-review-status.json (written by
# the `pr-self-review` skill) is fresh against the current diff and has zero
# CRITICAL findings. Deterministic shell only — hooks can't call an LLM.
set -euo pipefail

INPUT="$(cat)"

if command -v jq >/dev/null 2>&1; then
  COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
else
  COMMAND="$(printf '%s' "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"(.*)"$/\1/')"
fi

# Only gate commands that actually start (or follow a ; && || | newline) with
# `git push` or `gh pr create`. Everything else passes through untouched.
# Newlines are flattened to `;` first — BSD grep (macOS default) mishandles a
# literal newline embedded in an -E alternation and silently matches nothing,
# which would fail this gate wide open instead of closed.
FLAT_COMMAND="$(printf '%s' "$COMMAND" | tr '\n' ';')"
if ! printf '%s' "$FLAT_COMMAND" | grep -Eiq '(^|[;&|])[[:space:]]*(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)([[:space:];&|]|$)'; then
  exit 0
fi

# Documented, visible escape hatch (like `git commit --no-verify`).
if [ "${SKIP_PR_SELF_REVIEW:-}" = "1" ]; then
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

STATUS_FILE=".claude/pr-self-review-status.json"

deny() {
  reason="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg reason "$reason" \
      '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  else
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
  fi
  exit 0
}

DIFF_HASH=$({ git diff main...HEAD 2>/dev/null; git diff; git diff --cached; } | shasum -a 1 | awk '{print $1}')

if [ ! -f "$STATUS_FILE" ]; then
  deny "No PR Self Review run found for this diff. Ask Claude to run the pr-self-review skill before opening a PR or pushing."
fi

if command -v jq >/dev/null 2>&1; then
  ARTIFACT_HASH=$(jq -r '.diffHash // empty' "$STATUS_FILE" 2>/dev/null || echo "")
  CRITICAL_COUNT=$(jq -r '.criticalCount // 0' "$STATUS_FILE" 2>/dev/null || echo "0")
else
  ARTIFACT_HASH=$(grep -o '"diffHash"[[:space:]]*:[[:space:]]*"[a-f0-9]*"' "$STATUS_FILE" | grep -o '[a-f0-9]\{40\}' || echo "")
  CRITICAL_COUNT=$(grep -o '"criticalCount"[[:space:]]*:[[:space:]]*[0-9]\+' "$STATUS_FILE" | grep -o '[0-9]\+$' || echo "0")
fi

case "$CRITICAL_COUNT" in
  ''|*[!0-9]*) CRITICAL_COUNT=0 ;;
esac

if [ -z "$ARTIFACT_HASH" ] || [ "$ARTIFACT_HASH" != "$DIFF_HASH" ]; then
  deny "PR Self Review is stale — the diff changed since the last run. Ask Claude to re-run the pr-self-review skill."
fi

if [ "$CRITICAL_COUNT" -gt 0 ]; then
  deny "$CRITICAL_COUNT CRITICAL finding(s) outstanding from PR Self Review. Fix them, then re-run the pr-self-review skill. (Escape hatch: SKIP_PR_SELF_REVIEW=1, visible in the transcript.)"
fi

exit 0
