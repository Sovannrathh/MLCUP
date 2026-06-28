#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Wrapper installed at /usr/local/bin/worldcup that enforces the runtime
# environment secret boundary for `worldcup gateway`.
#
# Only the `gateway` subcommand is guarded; all other worldcup subcommands
# (dashboard, --version, ...) pass straight through unchanged.
#
# SECURITY: the validator, the python interpreter that runs it, and the real
# binary are all resolved from fixed paths, never from the environment.
set -u

_self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

REAL_WORLDCUP="/usr/local/bin/worldcup.real"
[ -x "$REAL_WORLDCUP" ] || REAL_WORLDCUP="${_self_dir}/worldcup.real"

GUARD="/usr/local/lib/nemoclaw/validate-worldcup-env-secret-boundary.py"
[ -f "$GUARD" ] || GUARD="${_self_dir}/validate-env-secret-boundary.py"

if [ "${1:-}" = "gateway" ]; then
  PYTHON3=""
  for _candidate in /usr/bin/python3 /usr/local/bin/python3 /opt/worldcup/.venv/bin/python3; do
    if [ -x "$_candidate" ]; then
      PYTHON3="$_candidate"
      break
    fi
  done
  if [ -z "$PYTHON3" ]; then
    echo "[SECURITY] Refusing worldcup gateway: no python3 at a trusted absolute path to run the secret-boundary guard" >&2
    exit 127
  fi
  "$PYTHON3" "$GUARD" runtime-env || exit $?
fi

exec "$REAL_WORLDCUP" "$@"
