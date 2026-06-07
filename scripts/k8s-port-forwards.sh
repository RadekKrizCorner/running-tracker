#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="dev.running-tracker.port-forwards"
NAMESPACE="${RUNNING_TRACKER_K8S_NAMESPACE:-running-tracker}"
CONTEXT="${RUNNING_TRACKER_K8S_CONTEXT:-kind-running-tracker}"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
LAUNCHD_APP_SUPPORT="$HOME/Library/Application Support/running-tracker"
LAUNCHD_SCRIPT="$LAUNCHD_APP_SUPPORT/k8s-port-forwards.sh"
LOG_DIR="${RUNNING_TRACKER_PORT_FORWARD_LOG_DIR:-$HOME/Library/Logs/running-tracker}"

export PATH="${PATH:-}:$HOME/.rd/bin:$HOME/.kuberlr/darwin-arm64:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

usage() {
  cat <<USAGE
Usage: $0 <command>

Commands:
  start             Start detached API and frontend port-forwards.
  stop              Stop detached API and frontend port-forwards.
  restart           Restart both detached port-forwards.
  status            Show detached forwarding status.
  install-launchd   Install a macOS LaunchAgent that keeps forwards available.
  uninstall-launchd Remove the macOS LaunchAgent.

Options:
  install-launchd --no-load  Write the plist without loading it.
USAGE
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_runtime_commands() {
  require_command kubectl
  require_command screen
  require_command curl
  require_command lsof
}

screen_session_running() {
  local session="$1"
  local sessions
  sessions="$(screen -ls 2>/dev/null || true)"
  grep -Eq "[0-9]+\\.${session}[[:space:]]" <<<"$sessions"
}

port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

port_listener_pids() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

assert_kubernetes_ready() {
  kubectl --context "$CONTEXT" get namespace "$NAMESPACE" >/dev/null
  kubectl --context "$CONTEXT" -n "$NAMESPACE" rollout status deployment/running-tracker-api --timeout=120s
  kubectl --context "$CONTEXT" -n "$NAMESPACE" rollout status deployment/running-tracker-frontend --timeout=120s
}

stop_session() {
  local session="$1"
  if screen_session_running "$session"; then
    screen -S "$session" -X quit >/dev/null 2>&1 || true
  fi
}

wait_until_free() {
  local port="$1"
  local attempts=20
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if ! port_listening "$port"; then
      return 0
    fi
    sleep 0.25
  done
  echo "Port $port is still in use." >&2
  return 1
}

clear_existing_kubectl_forward() {
  local port="$1"
  local pids
  local pid
  local command_line

  pids="$(port_listener_pids "$port")"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  for pid in $pids; do
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command_line" != *kubectl* || "$command_line" != *port-forward* ]]; then
      echo "Port $port is already used by another process:" >&2
      lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
      exit 1
    fi
  done

  echo "Stopping existing kubectl port-forward listener on localhost:$port"
  kill $pids >/dev/null 2>&1 || true
  wait_until_free "$port"
}

check_url() {
  local url="$1"
  curl -fsS --max-time 10 "$url" >/dev/null
}

wait_for_url() {
  local url="$1"
  local attempts=30
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if check_url "$url"; then
      return 0
    fi
    sleep 0.5
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

start_forward() {
  local session="$1"
  local service="$2"
  local port_mapping="$3"
  local local_port="$4"
  local health_url="$5"

  if screen_session_running "$session" && check_url "$health_url"; then
    echo "$session already running on localhost:$local_port"
    return 0
  fi

  stop_session "$session"
  clear_existing_kubectl_forward "$local_port"

  screen -dmS "$session" kubectl --context "$CONTEXT" -n "$NAMESPACE" port-forward "svc/$service" "$port_mapping"
  wait_for_url "$health_url"
  echo "$session forwarding localhost:$local_port"
}

start_forwards() {
  require_runtime_commands
  assert_kubernetes_ready
  start_forward "running-tracker-api-pf" "running-tracker-api" "8009:8009" "8009" "http://127.0.0.1:8009/health"
  start_forward "running-tracker-frontend-pf" "running-tracker-frontend" "8080:8080" "8080" "http://127.0.0.1:8080/"
  echo "Running Tracker is available at http://localhost:8080"
}

stop_forwards() {
  require_command screen
  stop_session "running-tracker-api-pf"
  stop_session "running-tracker-frontend-pf"
  echo "Stopped Running Tracker port-forward sessions."
}

status_forwards() {
  require_runtime_commands
  local failures=0

  if screen_session_running "running-tracker-api-pf"; then
    echo "running-tracker-api-pf is running"
  else
    echo "running-tracker-api-pf is not running"
    failures=1
  fi

  if check_url "http://127.0.0.1:8009/health"; then
    echo "API health is reachable at http://localhost:8009/health"
  else
    echo "API health is not reachable at http://localhost:8009/health"
    failures=1
  fi

  if screen_session_running "running-tracker-frontend-pf"; then
    echo "running-tracker-frontend-pf is running"
  else
    echo "running-tracker-frontend-pf is not running"
    failures=1
  fi

  if check_url "http://127.0.0.1:8080/"; then
    echo "Frontend is reachable at http://localhost:8080"
  else
    echo "Frontend is not reachable at http://localhost:8080"
    failures=1
  fi

  return "$failures"
}

write_launch_agent() {
  mkdir -p "$(dirname "$LAUNCH_AGENT")" "$LAUNCHD_APP_SUPPORT" "$LOG_DIR"
  cp "$SCRIPT_DIR/k8s-port-forwards.sh" "$LAUNCHD_SCRIPT"
  chmod 755 "$LAUNCHD_SCRIPT"
  : >"$LOG_DIR/port-forwards.out.log"
  : >"$LOG_DIR/port-forwards.err.log"

  cat >"$LAUNCH_AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$LAUNCHD_SCRIPT</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$HOME</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/port-forwards.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/port-forwards.err.log</string>
</dict>
</plist>
PLIST
}

install_launchd() {
  local load_agent=1
  if [[ "${1:-}" == "--no-load" ]]; then
    load_agent=0
  elif [[ "${1:-}" != "" ]]; then
    usage >&2
    exit 1
  fi

  require_command launchctl
  write_launch_agent
  echo "Wrote $LAUNCH_AGENT"

  if [[ "$load_agent" == "1" ]]; then
    local domain="gui/$(id -u)"
    launchctl bootout "$domain" "$LAUNCH_AGENT" >/dev/null 2>&1 || true
    launchctl bootstrap "$domain" "$LAUNCH_AGENT"
    launchctl kickstart -k "$domain/$LABEL"
    echo "Loaded $LABEL. It will retry every 60 seconds after login."
  fi
}

uninstall_launchd() {
  require_command launchctl
  local domain="gui/$(id -u)"
  launchctl bootout "$domain" "$LAUNCH_AGENT" >/dev/null 2>&1 || true
  rm -f "$LAUNCH_AGENT"
  rm -f "$LAUNCHD_SCRIPT"
  echo "Removed $LAUNCH_AGENT"
}

main() {
  local command="${1:-}"
  shift || true

  case "$command" in
    start)
      start_forwards "$@"
      ;;
    stop)
      stop_forwards "$@"
      ;;
    restart)
      stop_forwards
      start_forwards
      ;;
    status)
      status_forwards "$@"
      ;;
    install-launchd)
      install_launchd "$@"
      ;;
    uninstall-launchd)
      uninstall_launchd "$@"
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
