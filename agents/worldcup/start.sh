#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# NemoClaw sandbox entrypoint for WorldCup Agent.
#
# Launches `worldcup gateway run` and exposes the API on PUBLIC_PORT (8643)
# via socat from INTERNAL_PORT (18643). The dashboard is forwarded from
# DASHBOARD_INTERNAL_PORT to DASHBOARD_PUBLIC_PORT (18790).
#
# SECURITY: The gateway runs as a separate user so the sandboxed agent cannot
# kill it or restart it with a tampered config. Config hash is verified at
# startup to detect tampering.

set -euo pipefail

# ── Source shared sandbox initialisation library ─────────────────
_SANDBOX_INIT="/usr/local/lib/nemoclaw/sandbox-init.sh"
if [ ! -f "$_SANDBOX_INIT" ]; then
  _SANDBOX_INIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../scripts/lib/sandbox-init.sh"
fi
# shellcheck source=scripts/lib/sandbox-init.sh
source "$_SANDBOX_INIT"

harden_resource_limits

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

if [ -d /opt/worldcup/worldcup_cli/web_dist ]; then
  export WORLDCUP_WEB_DIST="${WORLDCUP_WEB_DIST:-/opt/worldcup/worldcup_cli/web_dist}"
fi

# ── Early stderr/stdout capture ──────────────────────────────────
prepare_restricted_log() {
  local path="$1"
  local owner="${2:-}"
  local mode="${3:-600}"
  local dir base tmp

  dir="$(dirname "$path")"
  base="$(basename "$path")"
  tmp="$(mktemp "${dir}/.${base}.tmp.XXXXXX")" || return 1
  : >"$tmp" || { rm -f "$tmp"; return 1; }
  if [ "$(id -u)" -eq 0 ] && [ -n "$owner" ] && ! chown "$owner" "$tmp"; then
    rm -f "$tmp"; return 1
  fi
  if ! chmod "$mode" "$tmp"; then rm -f "$tmp"; return 1; fi
  if ! mv -f "$tmp" "$path"; then rm -f "$tmp"; return 1; fi
}

_START_LOG="/tmp/nemoclaw-start.log"
if [ "$(id -u)" -eq 0 ]; then
  prepare_restricted_log "$_START_LOG" root:root 600
else
  prepare_restricted_log "$_START_LOG" "" 600
fi
exec > >(tee -a "$_START_LOG") 2> >(tee -a "$_START_LOG" >&2)

drop_capabilities /usr/local/bin/nemoclaw-start "$@"

# Normalize self-wrapper bootstrap
if [ "${1:-}" = "env" ]; then
  _raw_args=("$@")
  _self_wrapper_index=""
  for ((i = 1; i < ${#_raw_args[@]}; i += 1)); do
    case "${_raw_args[$i]}" in
      *=*) ;;
      nemoclaw-start | /usr/local/bin/nemoclaw-start)
        _self_wrapper_index="$i"
        break
        ;;
      *) break ;;
    esac
  done
  if [ -n "$_self_wrapper_index" ]; then
    for ((i = 1; i < _self_wrapper_index; i += 1)); do
      export "${_raw_args[$i]}"
    done
    set -- "${_raw_args[@]:$((_self_wrapper_index + 1))}"
  fi
fi

case "${1:-}" in
  nemoclaw-start | /usr/local/bin/nemoclaw-start) shift ;;
esac
NEMOCLAW_CMD=("$@")

_dashboard_port_raw="${NEMOCLAW_DASHBOARD_PORT:-}"
if [ -z "$_dashboard_port_raw" ]; then
  _dashboard_port=18790
else
  _dashboard_port="$(printf '%s' "$_dashboard_port_raw" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  _dashboard_port_valid=1
  case "$_dashboard_port" in
    *[!0-9]* | '') _dashboard_port_valid=0 ;;
  esac
  if [ "$_dashboard_port_valid" -eq 1 ] && { [ "$_dashboard_port" -lt 1024 ] || [ "$_dashboard_port" -gt 65535 ]; }; then
    _dashboard_port_valid=0
  fi
  if [ "$_dashboard_port_valid" -ne 1 ]; then
    echo "[SECURITY] Invalid NEMOCLAW_DASHBOARD_PORT='${NEMOCLAW_DASHBOARD_PORT}' - must be an integer between 1024 and 65535" >&2
    exit 1
  fi
fi

if [ "$_dashboard_port" -eq 8643 ]; then
  echo "[SECURITY] Invalid WorldCup dashboard port 8643 - reserved for the WorldCup OpenAI-compatible API" >&2
  exit 1
fi

PUBLIC_PORT=8643
INTERNAL_PORT=18643
DASHBOARD_PUBLIC_PORT="$_dashboard_port"
DASHBOARD_INTERNAL_PORT="${NEMOCLAW_WORLDCUP_DASHBOARD_INTERNAL_PORT:-19220}"
if [ "$DASHBOARD_PUBLIC_PORT" -eq "$DASHBOARD_INTERNAL_PORT" ]; then
  DASHBOARD_INTERNAL_PORT=19221
fi

WORLDCUP_DIR="/sandbox/.worldcup"
WORLDCUP_HASH_FILE="/etc/nemoclaw/worldcup.config-hash"

_WORLDCUP_BOUNDARY_VALIDATOR="/usr/local/lib/nemoclaw/validate-worldcup-env-secret-boundary.py"
if [ ! -f "$_WORLDCUP_BOUNDARY_VALIDATOR" ]; then
  _WORLDCUP_BOUNDARY_VALIDATOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/validate-env-secret-boundary.py"
fi

WORLDCUP="$(command -v worldcup)"

validate_tcp_port() {
  local name="$1" value="$2"
  case "$value" in
    '' | *[!0-9]*)
      echo "[gateway] ERROR: ${name} must be an integer TCP port, got '${value}'" >&2; exit 1 ;;
  esac
  if [ "$value" -lt 1024 ] || [ "$value" -gt 65535 ]; then
    echo "[gateway] ERROR: ${name} must be between 1024 and 65535, got '${value}'" >&2; exit 1
  fi
}

validate_tcp_port PUBLIC_PORT "$PUBLIC_PORT"
validate_tcp_port INTERNAL_PORT "$INTERNAL_PORT"
validate_tcp_port DASHBOARD_PUBLIC_PORT "$DASHBOARD_PUBLIC_PORT"
validate_tcp_port DASHBOARD_INTERNAL_PORT "$DASHBOARD_INTERNAL_PORT"

validate_env_secret_boundary() {
  local env_file="${WORLDCUP_DIR}/.env"
  [ -e "$env_file" ] || return 0
  if [ -L "$env_file" ]; then
    echo "[SECURITY] Refusing WorldCup startup because ${env_file} is a symlink" >&2
    return 1
  fi
  python3 "$_WORLDCUP_BOUNDARY_VALIDATOR" env-file "$env_file"
}

validate_runtime_env_secret_boundary() {
  python3 "$_WORLDCUP_BOUNDARY_VALIDATOR" runtime-env
}

print_gateway_urls() {
  local api_url dashboard_url
  api_url="http://127.0.0.1:${PUBLIC_PORT}/v1"
  dashboard_url="http://127.0.0.1:${DASHBOARD_PUBLIC_PORT}/"
  echo "[gateway] WorldCup Dashboard: ${dashboard_url}" >&2
  echo "[gateway] WorldCup API:       ${api_url}" >&2
  echo "[gateway] Health:             ${api_url%/v1}/health" >&2
}

start_gateway_log_stream() {
  { tail -n +1 -F /tmp/gateway.log 2>/dev/null | sed -u 's/^/[gateway-log:] /' >&2; } &
  GATEWAY_LOG_TAIL_PID=$!
}

start_dashboard_log_stream() {
  { tail -n +1 -F /tmp/dashboard.log 2>/dev/null | sed -u 's/^/[dashboard-log:] /' >&2; } &
  DASHBOARD_LOG_TAIL_PID=$!
}

SOCAT_PID=""
DASHBOARD_SOCAT_PID=""
start_socat_forwarder() {
  local public_port="$1" internal_port="$2" label="$3" pid_var="${4:-SOCAT_PID}"
  local _socat_pid

  if ! command -v socat >/dev/null 2>&1; then
    echo "[gateway] socat not available - ${label} port forwarding from host may not work" >&2
    return
  fi
  local attempts=0
  while [ "$attempts" -lt 30 ]; do
    if ss -tln 2>/dev/null | grep -q "127.0.0.1:${internal_port}"; then break; fi
    sleep 1; attempts=$((attempts + 1))
  done
  nohup socat TCP-LISTEN:"${public_port}",bind=0.0.0.0,fork,reuseaddr \
    TCP:127.0.0.1:"${internal_port}" >/dev/null 2>&1 &
  _socat_pid=$!
  printf -v "$pid_var" '%s' "$_socat_pid"
  echo "[gateway] ${label} socat forwarder 0.0.0.0:${public_port} -> 127.0.0.1:${internal_port} (pid ${_socat_pid})" >&2
}

wait_for_worldcup_gateway_internal() {
  local gateway_pid="$1" attempts=0
  while [ "$attempts" -lt 45 ]; do
    if curl -sf --max-time 2 "http://127.0.0.1:${INTERNAL_PORT}/health" >/dev/null 2>&1; then return 0; fi
    if ! kill -0 "$gateway_pid" 2>/dev/null; then wait "$gateway_pid"; return $?; fi
    attempts=$((attempts + 1)); sleep 1
  done
  echo "[gateway] WorldCup gateway did not become healthy on internal port ${INTERNAL_PORT}" >&2
  return 1
}

ensure_worldcup_state_dir() {
  local dir="$1" mode="$2"
  [ -L "$dir" ] && { echo "[SECURITY] Refusing layout repair because ${dir} is a symlink" >&2; return 1; }
  [ -e "$dir" ] && [ ! -d "$dir" ] && { echo "[SECURITY] Refusing layout repair because ${dir} is not a directory" >&2; return 1; }
  mkdir -p "$dir"
  if [ "$(id -u)" -eq 0 ]; then chown sandbox:sandbox "$dir"; fi
  chmod "$mode" "$dir"
}

repair_worldcup_startup_layout() {
  ensure_worldcup_state_dir "${WORLDCUP_DIR}/logs" 770
  ensure_worldcup_state_dir "${WORLDCUP_DIR}/sessions" 770
  ensure_worldcup_state_dir "${WORLDCUP_DIR}/skills" 770
}

# ── Proxy environment ────────────────────────────────────────────
PROXY_HOST="${NEMOCLAW_PROXY_HOST:-10.200.0.1}"
PROXY_PORT="${NEMOCLAW_PROXY_PORT:-3128}"
_PROXY_URL="http://${PROXY_HOST}:${PROXY_PORT}"
_NO_PROXY_VAL="localhost,127.0.0.1,::1,${PROXY_HOST}"
export HTTP_PROXY="$_PROXY_URL" HTTPS_PROXY="$_PROXY_URL"
export NO_PROXY="$_NO_PROXY_VAL"
export http_proxy="$_PROXY_URL" https_proxy="$_PROXY_URL" no_proxy="$_NO_PROXY_VAL"

if [ -n "${SSL_CERT_FILE:-}" ] && [ -f "${SSL_CERT_FILE}" ]; then
  export CURL_CA_BUNDLE="${CURL_CA_BUNDLE:-$SSL_CERT_FILE}"
  export REQUESTS_CA_BUNDLE="${REQUESTS_CA_BUNDLE:-$SSL_CERT_FILE}"
  export GIT_SSL_CAINFO="${GIT_SSL_CAINFO:-$SSL_CERT_FILE}"
fi

if [ "$(id -u)" -eq 0 ]; then
  _SANDBOX_HOME=$(getent passwd sandbox 2>/dev/null | cut -d: -f6)
  _SANDBOX_HOME="${_SANDBOX_HOME:-/sandbox}"
else
  _SANDBOX_HOME="${HOME:-/sandbox}"
fi

_PROXY_ENV_FILE="/tmp/nemoclaw-proxy-env.sh"
write_runtime_shell_env() {
  {
    cat <<PROXYEOF
export HTTP_PROXY="$_PROXY_URL"
export HTTPS_PROXY="$_PROXY_URL"
export NO_PROXY="$_NO_PROXY_VAL"
export http_proxy="$_PROXY_URL"
export https_proxy="$_PROXY_URL"
export no_proxy="$_NO_PROXY_VAL"
export WORLDCUP_HOME="${WORLDCUP_DIR}"
PROXYEOF
    for _ca_env_name in SSL_CERT_FILE CURL_CA_BUNDLE REQUESTS_CA_BUNDLE GIT_SSL_CAINFO; do
      _ca_env_value="${!_ca_env_name:-}"
      if [ -n "$_ca_env_value" ]; then
        printf 'export %s=%q\n' "$_ca_env_name" "$_ca_env_value"
      fi
    done
    cat <<'GUARDENVEOF'
# nemoclaw-configure-guard begin
worldcup() {
  case "$1" in
    setup|doctor)
      echo "Error: 'worldcup $1' cannot modify config inside the sandbox." >&2
      echo "NemoClaw manages sandbox config from the host for integrity checks." >&2
      echo "" >&2
      echo "To change your configuration, exit the sandbox and run:" >&2
      echo "  nemoclaw onboard --resume" >&2
      return 1
      ;;
  esac
  command worldcup "$@"
}
# nemoclaw-configure-guard end
GUARDENVEOF
  } | emit_sandbox_sourced_file "$_PROXY_ENV_FILE"
}

write_runtime_shell_env
lock_rc_files "$_SANDBOX_HOME"

echo 'Setting up NemoClaw (WorldCup)...' >&2

# ── Non-root fallback ──────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "[gateway] Running as non-root (uid=$(id -u)) — privilege separation disabled" >&2
  export HOME=/sandbox
  export WORLDCUP_HOME="${WORLDCUP_DIR}"

  if ! verify_config_integrity_if_locked "${WORLDCUP_DIR}"; then
    echo "[SECURITY] Config integrity check failed — refusing to start (non-root mode)" >&2
    exit 1
  fi
  validate_env_secret_boundary
  validate_runtime_env_secret_boundary

  if [ ${#NEMOCLAW_CMD[@]} -gt 0 ]; then exec "${NEMOCLAW_CMD[@]}"; fi

  repair_worldcup_startup_layout

  prepare_restricted_log /tmp/gateway.log "" 600
  # shellcheck disable=SC2119
  validate_tmp_permissions

  umask 0007
  WORLDCUP_HOME="${WORLDCUP_DIR}" \
    nohup "$WORLDCUP" gateway run >/tmp/gateway.log 2>&1 &
  GATEWAY_PID=$!
  echo "[gateway] worldcup gateway launched (pid $GATEWAY_PID)" >&2
  start_gateway_log_stream
  wait_for_worldcup_gateway_internal "$GATEWAY_PID"
  start_socat_forwarder "$PUBLIC_PORT" "$INTERNAL_PORT" "API" SOCAT_PID

  SANDBOX_CHILD_PIDS=("$GATEWAY_PID")
  [ -n "${GATEWAY_LOG_TAIL_PID:-}" ] && SANDBOX_CHILD_PIDS+=("$GATEWAY_LOG_TAIL_PID")
  # shellcheck disable=SC2034
  SANDBOX_WAIT_PID="$GATEWAY_PID"
  trap cleanup_on_signal SIGTERM SIGINT
  [ -n "${SOCAT_PID:-}" ] && SANDBOX_CHILD_PIDS+=("$SOCAT_PID")
  print_gateway_urls

  wait "$GATEWAY_PID"
  exit $?
fi

# ── Root path (full privilege separation via setpriv) ──────────

export WORLDCUP_HOME="${WORLDCUP_DIR}"
verify_config_integrity "${WORLDCUP_DIR}" "${WORLDCUP_HASH_FILE}"
validate_env_secret_boundary
validate_runtime_env_secret_boundary

if [ ${#NEMOCLAW_CMD[@]} -gt 0 ]; then
  exec "${STEP_DOWN_PREFIX_SANDBOX[@]}" "${NEMOCLAW_CMD[@]}"
fi

repair_worldcup_startup_layout

prepare_restricted_log /tmp/gateway.log gateway:gateway 600
# shellcheck disable=SC2119
validate_tmp_permissions

WORLDCUP_HOME="${WORLDCUP_DIR}" \
  nohup "${STEP_DOWN_PREFIX_GATEWAY[@]}" sh -c 'umask 0007; exec "$@" >/tmp/gateway.log 2>&1' sh "$WORLDCUP" gateway run &
GATEWAY_PID=$!
echo "[gateway] worldcup gateway launched as 'gateway' user (pid $GATEWAY_PID)" >&2
start_gateway_log_stream
wait_for_worldcup_gateway_internal "$GATEWAY_PID"
start_socat_forwarder "$PUBLIC_PORT" "$INTERNAL_PORT" "API" SOCAT_PID

SANDBOX_CHILD_PIDS=("$GATEWAY_PID")
[ -n "${GATEWAY_LOG_TAIL_PID:-}" ] && SANDBOX_CHILD_PIDS+=("$GATEWAY_LOG_TAIL_PID")
# shellcheck disable=SC2034
SANDBOX_WAIT_PID="$GATEWAY_PID"
trap cleanup_on_signal SIGTERM SIGINT
[ -n "${SOCAT_PID:-}" ] && SANDBOX_CHILD_PIDS+=("$SOCAT_PID")
print_gateway_urls

wait "$GATEWAY_PID"
