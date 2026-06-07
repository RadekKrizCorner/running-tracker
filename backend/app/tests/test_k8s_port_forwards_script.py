from __future__ import annotations

import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "k8s-port-forwards.sh"


def write_executable(path: Path, contents: str) -> None:
    """Write an executable test helper script."""
    path.write_text(contents)
    path.chmod(0o755)


def make_fake_bin(tmp_path: Path) -> Path:
    """Create fake external commands used by the port-forward helper."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()

    write_executable(
        fake_bin / "kubectl",
        """#!/usr/bin/env bash
set -euo pipefail
echo "kubectl $*" >> "$FAKE_COMMAND_LOG"
if [[ "$*" == "config current-context" ]]; then
  echo "${FAKE_KUBE_CONTEXT:-kind-running-tracker}"
elif [[ "$*" == *"get namespace running-tracker"* ]]; then
  exit 0
elif [[ "$*" == *"rollout status deployment/running-tracker-api"* ]]; then
  echo 'deployment "running-tracker-api" successfully rolled out'
elif [[ "$*" == *"rollout status deployment/running-tracker-frontend"* ]]; then
  echo 'deployment "running-tracker-frontend" successfully rolled out'
elif [[ "$*" == *"port-forward"* ]]; then
  echo "Forwarding from 127.0.0.1"
fi
""",
    )
    write_executable(
        fake_bin / "screen",
        """#!/usr/bin/env bash
set -euo pipefail
echo "screen $*" >> "$FAKE_COMMAND_LOG"
if [[ "$*" == "-ls" ]]; then
  cat "${FAKE_SCREEN_LIST:-/dev/null}"
  exit "${FAKE_SCREEN_EXIT:-0}"
elif [[ "$*" == *"-dmS"* ]]; then
  session="$2"
  touch "$FAKE_STATE_DIR/$session"
elif [[ "$*" == *"-X quit"* ]]; then
  session="$2"
  rm -f "$FAKE_STATE_DIR/$session"
fi
""",
    )
    write_executable(
        fake_bin / "curl",
        """#!/usr/bin/env bash
set -euo pipefail
echo "curl $*" >> "$FAKE_COMMAND_LOG"
if [[ "$*" == *"8009/health"* ]]; then
  echo '{"status":"ok"}'
elif [[ "$*" == *"8080/"* ]]; then
  echo '<div id="root"></div>'
fi
""",
    )
    write_executable(
        fake_bin / "lsof",
        """#!/usr/bin/env bash
set -euo pipefail
echo "lsof $*" >> "$FAKE_COMMAND_LOG"
exit 1
""",
    )
    write_executable(
        fake_bin / "launchctl",
        """#!/usr/bin/env bash
set -euo pipefail
echo "launchctl $*" >> "$FAKE_COMMAND_LOG"
""",
    )
    return fake_bin


def run_script(
    tmp_path: Path,
    *args: str,
    extra_env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run the port-forward helper with fake external commands."""
    fake_bin = make_fake_bin(tmp_path)
    env = os.environ.copy()
    env.update(
        {
            "FAKE_COMMAND_LOG": str(tmp_path / "commands.log"),
            "FAKE_STATE_DIR": str(tmp_path),
            "HOME": str(tmp_path / "home"),
            "PATH": f"{fake_bin}:{env['PATH']}",
        }
    )
    if extra_env is not None:
        env.update(extra_env)
    (tmp_path / "home").mkdir()
    (tmp_path / "commands.log").touch()
    return subprocess.run(
        [str(SCRIPT_PATH), *args],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def test_start_launches_api_and_frontend_forward_sessions(tmp_path: Path) -> None:
    """Verify start opens both service forwards in detached screen sessions."""
    result = run_script(tmp_path, "start")

    assert result.returncode == 0, result.stderr
    command_log = (tmp_path / "commands.log").read_text()
    assert (
        "screen -dmS running-tracker-api-pf kubectl --context kind-running-tracker "
        "-n running-tracker "
        "port-forward svc/running-tracker-api 8009:8009"
    ) in command_log
    assert (
        "screen -dmS running-tracker-frontend-pf kubectl --context kind-running-tracker "
        "-n running-tracker "
        "port-forward svc/running-tracker-frontend 8080:8080"
    ) in command_log
    assert "curl -fsS --max-time 10 http://127.0.0.1:8009/health" in command_log
    assert "curl -fsS --max-time 10 http://127.0.0.1:8080/" in command_log


def test_install_launchd_writes_plist_without_loading_when_requested(tmp_path: Path) -> None:
    """Verify launchd installation writes the expected LaunchAgent plist."""
    result = run_script(tmp_path, "install-launchd", "--no-load")

    assert result.returncode == 0, result.stderr
    plist = (
        tmp_path
        / "home"
        / "Library"
        / "LaunchAgents"
        / "dev.running-tracker.port-forwards.plist"
    )
    contents = plist.read_text()
    assert "<string>dev.running-tracker.port-forwards</string>" in contents
    launchd_script = (
        tmp_path
        / "home"
        / "Library"
        / "Application Support"
        / "running-tracker"
        / "k8s-port-forwards.sh"
    )
    assert launchd_script.exists()
    assert os.access(launchd_script, os.X_OK)
    assert f"<string>{launchd_script}</string>" in contents
    assert "<string>start</string>" in contents
    command_log = (tmp_path / "commands.log").read_text()
    assert "launchctl" not in command_log


def test_status_fails_when_forward_sessions_are_missing(tmp_path: Path) -> None:
    """Verify status reports missing detached forwarding sessions."""
    result = run_script(tmp_path, "status")

    assert result.returncode == 1
    assert "running-tracker-api-pf is not running" in result.stdout
    assert "running-tracker-frontend-pf is not running" in result.stdout


def test_status_accepts_screen_listing_with_nonzero_exit(tmp_path: Path) -> None:
    """Verify status parses screen listings even when screen exits non-zero."""
    screen_list = tmp_path / "screen-list.txt"
    screen_list.write_text(
        "\n".join(
            [
                "There are screens on:",
                "\t101.running-tracker-api-pf\t(Detached)",
                "\t102.running-tracker-frontend-pf\t(Detached)",
                "2 Sockets in /tmp/.screen.",
                "",
            ]
        )
    )

    result = run_script(
        tmp_path,
        "status",
        extra_env={
            "FAKE_SCREEN_LIST": str(screen_list),
            "FAKE_SCREEN_EXIT": "1",
        },
    )

    assert result.returncode == 0, result.stderr
    assert "running-tracker-api-pf is running" in result.stdout
    assert "running-tracker-frontend-pf is running" in result.stdout
