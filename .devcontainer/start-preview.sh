#!/usr/bin/env bash
set -euo pipefail
pid_file=/tmp/millie-preview.pid
if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
  exit 0
fi
nohup npm run dev:codespaces > /tmp/millie-preview.log 2>&1 &
echo "$!" > "$pid_file"
