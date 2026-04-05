#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any

from client_common import (
    BOOTSTRAP_ROOT,
    DOWNLOADS_DIR,
    RELEASES_DIR,
    RUNTIME_DIR,
    assert_linux_supported,
    ensure_layout,
    extract_zip,
    get_control_plane_base_url,
    get_default_client_version,
    get_state,
    invoke_control_plane_json,
    mark_background_update,
    parse_iso,
    resolve_control_plane_url,
    resolve_effective_workspace_path,
    resolve_project_key,
    resolve_workspace_tool_path,
    run_command,
    save_state,
    set_project_key,
    sha256_file,
    sync_bootstrap_files,
    test_model_lease_valid,
    test_session_valid,
    update_installed_versions_list,
    utc_now_iso,
    write_json_result,
)


def shell_text(command: list[str]) -> str:
    try:
        result = run_command(command, check=True)
        return result.stdout.strip() or result.stderr.strip()
    except Exception:
        return ""


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def node_major() -> int:
    version = shell_text(["node", "--version"]).lstrip("v")
    if not version:
        return 0
    try:
        return int(version.split(".", 1)[0])
    except ValueError:
        return 0


def installed_versions() -> dict[str, str]:
    return {
        "git": shell_text(["git", "--version"]),
        "node": shell_text(["node", "--version"]),
        "corepack": shell_text(["corepack", "--version"]),
        "pnpm": shell_text(["pnpm", "--version"]),
        "openclaw": shell_text(["openclaw", "--version"]),
    }


def os_version() -> str:
    os_release = Path("/etc/os-release")
    if os_release.exists():
        fields: dict[str, str] = {}
        for line in os_release.read_text(encoding="utf-8").splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            fields[key] = value.strip().strip('"')
        pretty = fields.get("PRETTY_NAME")
        if pretty:
            return pretty
    return platform.platform()


def device_fingerprint() -> str:
    machine_id_paths = [
        Path("/etc/machine-id"),
        Path("/var/lib/dbus/machine-id"),
    ]
    machine_id = ""
    for candidate in machine_id_paths:
        if candidate.exists():
            machine_id = candidate.read_text(encoding="utf-8").strip()
            if machine_id:
                break
    raw = "|".join(
        [
            os.environ.get("HOSTNAME", ""),
            platform.node(),
            platform.machine(),
            machine_id,
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def run_shell(script: str, *, sudo: bool = False) -> subprocess.CompletedProcess[str]:
    if sudo and os.geteuid() != 0:
        if not command_exists("sudo"):
            raise RuntimeError("sudo is required to install missing dependencies.")
        return run_command(["sudo", "bash", "-lc", script], check=True)
    return run_command(["bash", "-lc", script], check=True)


def preflight(apply_fixes: bool) -> dict[str, Any]:
    ensure_layout()
    assert_linux_supported()

    result: dict[str, Any] = {
        "status": "ok",
        "applyFixes": apply_fixes,
        "items": [],
        "versions": {},
    }

    def add_item(
        name: str,
        status: str,
        *,
        version: str = "",
        message: str = "",
        fix_applied: bool = False,
    ) -> None:
        result["items"].append(
            {
                "name": name,
                "status": status,
                "version": version,
                "message": message,
                "fixApplied": fix_applied,
            }
        )
        if status in {"failed", "manual_action_required"}:
            result["status"] = "failed"

    git_version = shell_text(["git", "--version"])
    if git_version:
        add_item("git", "ok", version=git_version)
    elif apply_fixes:
        try:
            run_shell("apt-get update -y && apt-get install -y git", sudo=True)
            git_version = shell_text(["git", "--version"])
            if git_version:
                add_item("git", "ok", version=git_version, message="Installed with apt.", fix_applied=True)
            else:
                add_item("git", "failed", message="Git install completed but git is still unavailable.")
        except Exception as error:
            add_item("git", "failed", message=str(error))
    else:
        add_item("git", "missing", message="Git is not installed.")

    current_node_major = node_major()
    node_version = shell_text(["node", "--version"])
    if current_node_major >= 22:
        add_item("node", "ok", version=node_version)
    elif apply_fixes:
        try:
            script = """
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  chmod a+r /etc/apt/keyrings/nodesource.gpg
fi
cat >/etc/apt/sources.list.d/nodesource.list <<'EOF'
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main
EOF
apt-get update -y
apt-get install -y nodejs
"""
            run_shell(script, sudo=True)
            current_node_major = node_major()
            node_version = shell_text(["node", "--version"])
            if current_node_major >= 22:
                add_item("node", "ok", version=node_version, message="Installed Node.js 22.", fix_applied=True)
            else:
                add_item("node", "failed", message="Node.js 22 installation did not make node 22+ available.")
        except Exception as error:
            add_item("node", "failed", message=str(error))
    else:
        add_item("node", "missing", version=node_version, message="Node.js 22+ is required.")

    corepack_version = shell_text(["corepack", "--version"])
    if corepack_version:
        try:
            if apply_fixes:
                run_command(["corepack", "enable"], check=True)
                run_command(["corepack", "prepare", "pnpm@10.11.0", "--activate"], check=True)
            add_item("corepack", "ok", version=corepack_version)
        except Exception as error:
            add_item("corepack", "failed", version=corepack_version, message=str(error))
    else:
        add_item("corepack", "missing", message="Corepack is not available from the current Node.js installation.")

    pnpm_version = shell_text(["pnpm", "--version"])
    if pnpm_version:
        add_item("pnpm", "ok", version=pnpm_version)
    elif apply_fixes and command_exists("corepack"):
        try:
            run_command(["corepack", "prepare", "pnpm@10.11.0", "--activate"], check=True)
            pnpm_version = shell_text(["pnpm", "--version"])
            if pnpm_version:
                add_item("pnpm", "ok", version=pnpm_version, message="Activated via corepack.", fix_applied=True)
            else:
                add_item("pnpm", "failed", message="pnpm activation did not succeed.")
        except Exception as error:
            add_item("pnpm", "failed", message=str(error))
    else:
        add_item("pnpm", "missing", message="pnpm is not available.")

    result["versions"] = installed_versions()
    return result


def action_install(args: argparse.Namespace) -> None:
    state = get_state()
    project_key = set_project_key(state, args.project_key, skip_reset=False)
    preflight_result = (
        {
            "status": "skipped",
            "applyFixes": False,
            "items": [],
            "versions": installed_versions(),
        }
        if args.skip_prereq_checks
        else preflight(apply_fixes=not args.skip_prereq_checks)
    )

    state["bootstrapRoot"] = sync_bootstrap_files()
    state["bootstrapVersion"] = state.get("bootstrapVersion") or "bootstrap-ubuntu-1"
    state["bootstrapInstalledAt"] = utc_now_iso()
    if args.workspace_path:
        state["workspacePath"] = str(Path(args.workspace_path).expanduser().resolve())
    elif not state.get("workspacePath"):
        state["workspacePath"] = str(Path(__file__).resolve().parents[2])
    if args.control_plane_base_url:
        state["controlPlaneBaseUrl"] = args.control_plane_base_url.rstrip("/")
    state["installedAt"] = utc_now_iso()
    state["projectKey"] = project_key
    state["prerequisites"] = preflight_result

    save_state(state)

    if preflight_result["status"] in {"failed", "manual_action_required"}:
        write_json_result(
            {
                "status": preflight_result["status"],
                "projectKey": project_key,
                "clientRoot": str(Path(state["bootstrapRoot"]).parent),
                "bootstrapRoot": state["bootstrapRoot"],
                "bootstrapVersion": state["bootstrapVersion"],
                "workspacePath": state["workspacePath"],
                "currentVersion": state.get("currentVersion") or "",
                "controlPlaneBaseUrl": get_control_plane_base_url(state),
                "openClawVersion": state.get("openClaw", {}).get("version", ""),
                "prerequisites": preflight_result,
            }
        )
        return

    if not args.skip_openclaw_install:
        script_path = BOOTSTRAP_ROOT / "install-openclaw-latest.sh"
        if not script_path.exists():
            raise RuntimeError("Ubuntu OpenClaw installer script not found in bootstrap assets.")
        install_result = run_command(["bash", str(script_path)], check=True)
        version_text = ""
        for line in reversed((install_result.stdout or "").splitlines()):
            if line.strip():
                version_text = line.strip()
                break
        state.setdefault("openClaw", {})
        state["openClaw"]["version"] = version_text
        state["openClaw"]["installedAt"] = utc_now_iso()
        save_state(state)

    write_json_result(
        {
            "status": "ok",
            "projectKey": project_key,
            "clientRoot": str(Path(state["bootstrapRoot"]).parent),
            "bootstrapRoot": state["bootstrapRoot"],
            "bootstrapVersion": state["bootstrapVersion"],
            "workspacePath": state["workspacePath"],
            "currentVersion": state.get("currentVersion") or "",
            "controlPlaneBaseUrl": get_control_plane_base_url(state),
            "openClawVersion": state.get("openClaw", {}).get("version", ""),
            "prerequisites": preflight_result,
        }
    )


def action_auth(args: argparse.Namespace) -> None:
    if not args.phone:
        raise RuntimeError("Phone is required for auth.")
    state = get_state()
    project_key = set_project_key(state, args.project_key, skip_reset=False)
    reported_version = str(state.get("currentVersion") or "")
    result = invoke_control_plane_json(
        state,
        "/api/client/bootstrap/auth",
        method="POST",
        body={
            "phone": args.phone,
            "projectKey": project_key,
            "deviceFingerprint": device_fingerprint(),
            "deviceName": platform.node(),
            "osVersion": os_version(),
            "clientVersion": reported_version,
            "openclawVersion": str((state.get("openClaw") or {}).get("version") or ""),
        },
    )
    state["phone"] = str(result["user"]["phone"])
    state["session"] = {
        "token": str(result["session"]["token"]),
        "expiresAt": str(result["session"]["expiresAt"]),
        "validatedAt": utc_now_iso(),
    }
    state["modelAccess"] = {
        "mode": str(result["modelAccess"]["mode"]),
        "providers": list(result["modelAccess"].get("providers") or []),
    }
    state["modelLease"] = None
    state["lastAuth"] = result
    policy = invoke_control_plane_json(
        state,
        "/api/client/policy",
        method="GET",
        session_token=state["session"]["token"],
    )
    state["lastPolicy"] = policy.get("policy")
    save_state(state)
    write_json_result(
        {
            "status": result["status"],
            "projectKey": project_key,
            "user": result["user"],
            "device": result["device"],
            "session": result["session"],
            "upgrade": result["upgrade"],
            "modelAccess": result["modelAccess"],
            "policy": policy.get("policy"),
        }
    )


def action_lease_model(args: argparse.Namespace) -> None:
    state = get_state()
    project_key = set_project_key(state, args.project_key, skip_reset=False)
    if not test_session_valid(state):
        raise RuntimeError("No valid client session. Run auth first.")
    provider_scope = args.provider_scope
    if not provider_scope:
        last_policy = state.get("lastPolicy") or {}
        scopes = list(last_policy.get("providerScopes") or [])
        if scopes:
            provider_scope = str(scopes[0])
        else:
            providers = list((state.get("modelAccess") or {}).get("providers") or [])
            provider_scope = str(providers[0]) if providers else "default"
    result = invoke_control_plane_json(
        state,
        "/api/client/model-lease",
        method="POST",
        session_token=str(state["session"]["token"]),
        body={"projectKey": project_key, "providerScope": provider_scope},
    )
    state["modelLease"] = {
        "providerScope": provider_scope,
        "token": str(result["lease"]["token"]),
        "expiresAt": str(result["lease"]["expiresAt"]),
        "proxyBaseUrl": str(result["proxy"]["baseUrl"]),
        "issuedAt": utc_now_iso(),
    }
    save_state(state)
    write_json_result(
        {
            "status": "ok",
            "projectKey": project_key,
            "providerScope": provider_scope,
            "lease": state["modelLease"],
        }
    )


def action_check_update(args: argparse.Namespace) -> None:
    state = get_state()
    project_key = set_project_key(state, args.project_key, skip_reset=False)
    if not test_session_valid(state):
        raise RuntimeError("No valid client session. Run auth first.")
    policy = invoke_control_plane_json(
        state,
        "/api/client/policy",
        method="GET",
        session_token=str(state["session"]["token"]),
    )
    channel = str(state.get("channel") or "stable")
    release = invoke_control_plane_json(
        state,
        f"/api/client/releases/latest?channel={channel}",
        method="GET",
        session_token=str(state["session"]["token"]),
    )
    state["pendingRelease"] = release.get("release")
    state["lastPolicy"] = policy.get("policy")
    save_state(state)
    write_json_result(
        {
            "status": "ok",
            "projectKey": project_key,
            "currentVersion": str(state.get("currentVersion") or get_default_client_version()),
            "channel": channel,
            "policy": policy.get("policy"),
            "pendingRelease": release.get("release"),
        }
    )


def action_download_update(_: argparse.Namespace) -> None:
    state = get_state()
    pending = state.get("pendingRelease") or {}
    if not pending:
        raise RuntimeError("No pending release. Run check-update first.")
    version = str(pending["version"])
    artifact_url = str(pending["artifactUrl"])
    destination = DOWNLOADS_DIR / f"{version}.zip"
    expected_sha = str(pending.get("artifactSha256") or "").lower()
    expected_size = int(pending.get("artifactSize") or 0)
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if expected_size and destination.stat().st_size == expected_size and (not expected_sha or sha256_file(destination) == expected_sha):
            state["download"] = {
                "version": version,
                "destination": str(destination),
                "status": "completed",
                "bytesTransferred": destination.stat().st_size,
                "bytesTotal": expected_size or destination.stat().st_size,
                "updatedAt": utc_now_iso(),
            }
            save_state(state)
            write_json_result(state["download"])
            return
        destination.unlink()
    with resolve_urlopen(artifact_url) as response, destination.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    size = destination.stat().st_size
    if expected_size and size != expected_size:
        raise RuntimeError(f"Downloaded artifact size mismatch for {version}.")
    if expected_sha and sha256_file(destination) != expected_sha:
        raise RuntimeError(f"Downloaded artifact hash mismatch for {version}.")
    state["download"] = {
        "version": version,
        "destination": str(destination),
        "status": "completed",
        "bytesTransferred": size,
        "bytesTotal": expected_size or size,
        "updatedAt": utc_now_iso(),
    }
    save_state(state)
    write_json_result(state["download"])


def resolve_urlopen(url: str):
    import urllib.request

    request = urllib.request.Request(url=url, method="GET")
    return urllib.request.urlopen(request, timeout=120)


def action_apply_update(_: argparse.Namespace) -> None:
    state = get_state()
    pending = state.get("pendingRelease") or {}
    download = state.get("download") or {}
    if not pending:
        raise RuntimeError("No pending release. Run check-update first.")
    if str(download.get("status") or "") != "completed":
        raise RuntimeError("No completed download. Run download-update first.")
    version = str(pending["version"])
    archive_path = Path(str(download["destination"]))
    destination = RELEASES_DIR / version
    if not archive_path.exists():
        raise RuntimeError(f"Downloaded archive missing: {archive_path}")
    extract_zip(archive_path, destination)
    run_command(["corepack", "pnpm", "install"], cwd=destination, check=True)
    run_command(["corepack", "pnpm", "--filter", "worker", "build"], cwd=destination, check=True)
    run_command(["corepack", "pnpm", "--filter", "web", "build"], cwd=destination, check=True)
    state["currentReleasePath"] = str(destination)
    state["currentVersion"] = version
    update_installed_versions_list(state, version)
    save_state(state)
    write_json_result(
        {
            "status": "ok",
            "currentVersion": version,
            "currentReleasePath": str(destination),
        }
    )


def background_updater_pid(state: dict[str, Any]) -> int:
    payload = state.get("backgroundUpdate") or {}
    raw_pid = str(payload.get("pid") or "").strip()
    if not raw_pid:
        return 0
    try:
        return int(raw_pid)
    except ValueError:
        return 0


def process_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def spawn_background_update(state: dict[str, Any], action_script: Path) -> None:
    existing_pid = background_updater_pid(state)
    if existing_pid and process_running(existing_pid):
        return
    proc = subprocess.Popen(
        ["bash", str(action_script), "--action", "background-update"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    pending = state.get("pendingRelease") or {}
    state["backgroundUpdate"] = {
        "status": "scheduled",
        "stage": "queued",
        "pid": proc.pid,
        "releaseVersion": str(pending.get("version") or ""),
        "message": "Background updater has been scheduled.",
        "updatedAt": utc_now_iso(),
    }
    save_state(state)


def action_background_update(_: argparse.Namespace) -> None:
    state = get_state()
    try:
        if not test_session_valid(state):
            mark_background_update(state, "skipped", "auth", "No valid client session.")
            return
        action_check_update(argparse.Namespace(project_key="", provider_scope="", phone=""))
        state = get_state()
        pending = state.get("pendingRelease") or {}
        current = str(state.get("currentVersion") or "")
        version = str(pending.get("version") or "")
        if not version or version == current:
            mark_background_update(state, "noop", "check", "No newer release available.", version)
            return
        mark_background_update(state, "running", "download", "Downloading release.", version)
        action_download_update(argparse.Namespace())
        state = get_state()
        mark_background_update(state, "running", "apply", "Applying release.", version)
        action_apply_update(argparse.Namespace())
        state = get_state()
        mark_background_update(state, "applied", "complete", "Background update applied successfully.", version)
    except Exception as error:
        state = get_state()
        version = str(((state.get("pendingRelease") or {}).get("version")) or "")
        mark_background_update(state, "failed", "error", str(error), version)
        raise


def action_start(args: argparse.Namespace) -> None:
    state = get_state()
    project_key = set_project_key(state, args.project_key, skip_reset=False)
    save_state(state)
    if args.phone:
        action_auth(args)
        state = get_state()
    if not test_session_valid(state):
        raise RuntimeError("No valid client session. Pass --phone or run auth first.")
    last_auth = state.get("lastAuth") or {}
    upgrade = last_auth.get("upgrade") or {}
    if str(upgrade.get("state") or "") == "force_upgrade_required":
        raise RuntimeError("Client is blocked by a forced upgrade requirement. Run update first.")
    policy = state.get("lastPolicy") or {}
    model_access_mode = str(policy.get("modelAccessMode") or (state.get("modelAccess") or {}).get("mode") or "")
    if model_access_mode == "lease" and not test_model_lease_valid(state):
        action_lease_model(args)
        state = get_state()
    pending = state.get("pendingRelease") or {}
    download = state.get("download") or {}
    if str(download.get("status") or "") == "completed" and str(pending.get("version") or "") and str(pending.get("version")) != str(state.get("currentVersion") or ""):
        action_apply_update(argparse.Namespace())
        state = get_state()
    start_script = resolve_workspace_tool_path(state, "tools/start-local.sh")
    if not start_script or not Path(start_script).exists():
        raise RuntimeError(f"Runtime start script not found: {start_script}")
    env = os.environ.copy()
    env["CONTROL_PLANE_API_BASE_URL"] = get_control_plane_base_url(state)
    env["AI_DATA_PLATFORM_CLIENT_ROOT"] = str(Path(state["bootstrapRoot"]).parent)
    env["AI_DATA_PLATFORM_CLIENT_PROJECT_KEY"] = project_key
    env["AI_DATA_PLATFORM_RUN_DIR"] = str(RUNTIME_DIR / "local-dev")
    run_command(["bash", start_script], env=env, check=True, capture=False)
    spawn_background_update(state, BOOTSTRAP_ROOT / "manage-client.sh")


def action_stop(_: argparse.Namespace) -> None:
    state = get_state()
    stop_script = resolve_workspace_tool_path(state, "tools/stop-local.sh")
    if stop_script and Path(stop_script).exists():
        env = os.environ.copy()
        env["AI_DATA_PLATFORM_RUN_DIR"] = str(RUNTIME_DIR / "local-dev")
        run_command(["bash", stop_script], env=env, check=True, capture=False)
        return
    write_json_result({"status": "noop", "message": "No runtime stop script found."})


def action_status(_: argparse.Namespace) -> None:
    state = get_state()
    runtime_status = ""
    status_script = resolve_workspace_tool_path(state, "tools/status-local.sh")
    if status_script and Path(status_script).exists():
        try:
            env = os.environ.copy()
            env["AI_DATA_PLATFORM_RUN_DIR"] = str(RUNTIME_DIR / "local-dev")
            runtime_status = run_command(["bash", status_script], env=env, check=True).stdout.strip()
        except Exception as error:
            runtime_status = f"status-error: {error}"
    write_json_result(
        {
            "clientRoot": str(Path(state["bootstrapRoot"]).parent) if state.get("bootstrapRoot") else "",
            "bootstrapRoot": str(state.get("bootstrapRoot") or ""),
            "bootstrapVersion": str(state.get("bootstrapVersion") or ""),
            "workspacePath": str(state.get("workspacePath") or ""),
            "currentReleasePath": str(state.get("currentReleasePath") or ""),
            "currentVersion": str(state.get("currentVersion") or ""),
            "channel": str(state.get("channel") or ""),
            "projectKey": str(state.get("projectKey") or ""),
            "phone": str(state.get("phone") or ""),
            "sessionValid": test_session_valid(state),
            "modelAccess": state.get("modelAccess"),
            "modelLease": state.get("modelLease"),
            "modelLeaseValid": test_model_lease_valid(state),
            "policy": state.get("lastPolicy"),
            "pendingReleaseVersion": str(((state.get("pendingRelease") or {}).get("version")) or ""),
            "downloadStatus": str(((state.get("download") or {}).get("status")) or ""),
            "backgroundUpdate": state.get("backgroundUpdate"),
            "preflightStatus": str(((state.get("prerequisites") or {}).get("status")) or ""),
            "prerequisites": state.get("prerequisites"),
            "controlPlaneBaseUrl": get_control_plane_base_url(state),
            "openClawVersion": str(((state.get("openClaw") or {}).get("version")) or ""),
            "runtimeStatus": runtime_status,
        }
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ubuntu client manager for AI Data Platform.")
    parser.add_argument("--action", required=True, choices=[
        "install",
        "preflight",
        "auth",
        "lease-model",
        "check-update",
        "download-update",
        "apply-update",
        "background-update",
        "start",
        "stop",
        "status",
    ])
    parser.add_argument("--phone", default="")
    parser.add_argument("--provider-scope", default="")
    parser.add_argument("--workspace-path", default="")
    parser.add_argument("--control-plane-base-url", default="")
    parser.add_argument("--project-key", default="")
    parser.add_argument("--skip-openclaw-install", action="store_true")
    parser.add_argument("--skip-prereq-checks", action="store_true")
    parser.add_argument("--apply-fixes", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    ensure_layout()
    assert_linux_supported()
    action = args.action
    if action == "install":
        action_install(args)
    elif action == "preflight":
        write_json_result(preflight(apply_fixes=args.apply_fixes))
    elif action == "auth":
        action_auth(args)
    elif action == "lease-model":
        action_lease_model(args)
    elif action == "check-update":
        action_check_update(args)
    elif action == "download-update":
        action_download_update(args)
    elif action == "apply-update":
        action_apply_update(args)
    elif action == "background-update":
        action_background_update(args)
    elif action == "start":
        action_start(args)
    elif action == "stop":
        action_stop(args)
    elif action == "status":
        action_status(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
