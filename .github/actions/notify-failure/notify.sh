#!/usr/bin/env bash
# Publish a short ntfy.sh alert for the current (failed) workflow run.
#
# Reads everything from the environment (see action.yml). The topic is only ever used inside the
# request URL and never echoed; do not add `set -x` or curl `-v` here.
set -uo pipefail

if [ -z "${NTFY_TOPIC:-}" ]; then
  echo "::warning::NTFY_TOPIC secret is not set; skipping failure notification."
  exit 0
fi

one_line() { tr '\r\n\t' '   ' | sed -E 's/ +/ /g; s/^ //; s/ $//' | cut -c "1-${1:-140}"; }

# Best effort: find the first failed job/step of this attempt. Lookup errors must never stop the
# alert itself, so every API call falls back to a generic value.
jobs_json=$(gh api "repos/$REPO/actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT/jobs" 2>/dev/null || echo '{}')

failed_job_id=$(jq -r '[.jobs[]? | select(.conclusion == "failure")][0].id // empty' <<<"$jobs_json")
failed_step=$(jq -r '
  [.jobs[]? | select(.conclusion == "failure") | .steps[]? | select(.conclusion == "failure") | .name][0]
  // ([.jobs[]? | select(.conclusion == "failure") | .name][0])
  // empty' <<<"$jobs_json" | one_line 60)
failed_step=${failed_step:-unknown step}

# Prefer the first error annotation that says more than the generic "Process completed with exit
# code N"; fall back to just the exit code so there is always some clue.
detail=""
if [ -n "$failed_job_id" ]; then
  detail=$(gh api "repos/$REPO/check-runs/$failed_job_id/annotations" 2>/dev/null | jq -r '
    [.[]? | select(.annotation_level == "failure") | .message] as $msgs
    | ([$msgs[] | select(test("^Process completed with exit code") | not)][0])
      // ([$msgs[] | capture("exit code (?<c>[0-9]+)") | "Exit code \(.c)"][0])
      // empty' 2>/dev/null | one_line 140)
fi

title="$TITLE_PREFIX: $failed_step"
meta="Run #$RUN_NUMBER · $EVENT · ${SHA:0:7}"
if [ -n "$detail" ]; then
  body="$detail"$'\n'"$meta"
else
  body="$meta"
fi

echo "Sending failure notification: $title"
curl -fsS --max-time 20 --retry 2 -o /dev/null \
  -H "Title: $title" \
  -H "Priority: high" \
  -H "Tags: rotating_light" \
  -H "Click: $RUN_URL" \
  -H "Actions: view, Open run, $RUN_URL, clear=true" \
  --data-binary "$body" \
  "https://ntfy.sh/$NTFY_TOPIC"
