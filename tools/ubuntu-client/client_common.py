#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
CLIENT_ROOT = Path(
    os.environ.get(
        "AI_DATA_PLATFORM_CLIENT_ROOT",
        str(Path.home() / ".local" / "share" / "ai-data-platform"),
    )
)
BOOTSTRAP_ROOT = CLIENT_ROOT / "bootstrap"
CONFIG_DIR = CLIENT_ROOT / "config"
DOWNLOADS_DIR = CLIENT_ROOT / "downloads"
RELEASES_DIR = CLIENT_ROOT / "releases"
LOGS_DIR = CLIENT_ROOT / "logs"
RUNTIME_DIR = CLIENT_ROOT / "runtime"
STATE_PATH = CONFIG_DIR / "client-state.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def ensure_layout() -> None:
    for path in (
        CLIENT_ROOT,
        BOOTSTRAP_ROOT,
        CONFIG_DIR,
        DOWNLOADS_DIR,
        RELEASES_DIR,
        LOGS_DIR,
        RUNTIME_DIR,
    ):
        path.mkdir(parents=True, exist_ok=True)


def get_default_client_version() -> str:
    configured = os.environ.get("AI_DATA_PLATFORM_CLIENT_VERSION", "").strip()
    if configured:
        return configured
    return datetime.now().strftime("%Y.%m.%d") + "+001"


def get_bootstrap_version() -> str:
    configured = os.environ.get("AI_DATA_PLATFORM_BOOTSTRAP_VERSION", "").strip()
    if configured:
        return configured
    return "bootstrap-ubuntu-1"


def get_default_project_key() -> str:
    if os.environ.get("AI_DATA_PLATFORM_CLIENT_PROJECT_KEY"):
        return os.environ["AI_DATA_PLATFORM_CLIENT_PROJECT_KEY"].strip().lower()
    if os.environ.get("CONTROL_PLANE_PROJECT_KEY"):
        return os.environ["CONTROL_PLANE_PROJECT_KEY"].strip().lower()
    return "ubuntu-client"


def default_state() -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "bootstrapVersion": get_bootstrap_version(),
        "bootstrapRoot": str(BOOTSTRAP_ROOT),
        "bootstrapInstalledAt": "",
        "channel": "stable",
        "projectKey": get_default_project_key(),
        "controlPlaneBaseUrl": os.environ.get("CONTROL_PLANE_API_BASE_URL", "").strip(),
        "workspacePath": str(REPO_ROOT) if REPO_ROOT.exists() else "",
        "currentReleasePath": "",
        "currentVersion": "",
        "installedVersions": [],
        "installedAt": "",
        "phone": "",
        "session": {"token": "", "expiresAt": "", "validatedAt": ""},
        "lastAuth": None,
        "lastPolicy": None,
        "modelAccess": {"mode": "lease", "providers": []},
        "modelLease": None,
        "pendingRelease": None,
        "download": None,
        "backgroundUpdate": None,
        "prerequisites": {},
        "openClaw": {"installMode": "direct", "version": "", "installedAt": ""},
    }


def merge_defaults(payload: dict[str, Any]) -> dict[str, Any]:
    merged = default_state()
    merged.update(payload or {})
    merged["session"] = {**default_state()["session"], **(payload.get("session") or {})}
    merged["modelAccess"] = {
        **default_state()["modelAccess"],
        **(payload.get("modelAccess") or {}),
    }
    merged["openClaw"] = {**default_state()["openClaw"], **(payload.get("openClaw") or {})}
    if not merged.get("projectKey"):
        merged["projectKey"] = get_default_project_key()
    return merged


def get_state() -> dict[str, Any]:
    ensure_layout()
    if not STATE_PATH.exists():
        return default_state()
    raw = STATE_PATH.read_text(encoding="utf-8").strip()
    if not raw:
        return default_state()
    return merge_defaults(json.loads(raw))


def save_state(state: dict[str, Any]) -> None:
    ensure_layout()
    STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def resolve_project_key(state: dict[str, Any], project_key: str) -> str:
    if project_key:
        return project_key.strip().lower()
    current = str(state.get("projectKey") or "").strip().lower()
    return current or get_default_project_key()


def reset_project_scoped_state(state: dict[str, Any]) -> None:
    state["session"] = {"token": "", "expiresAt": "", "validatedAt": ""}
    state["lastAuth"] = None
    state["lastPolicy"] = None
    state["modelAccess"] = {"mode": "lease", "providers": []}
    state["modelLease"] = None
    state["pendingRelease"] = None
    state["download"] = None
    state["backgroundUpdate"] = None


def set_project_key(state: dict[str, Any], project_key: str, skip_reset: bool = False) -> str:
    resolved = resolve_project_key(state, project_key)
    current = str(state.get("projectKey") or "").strip().lower()
    if current != resolved:
        state["projectKey"] = resolved
        if not skip_reset:
            reset_project_scoped_state(state)
    elif not current:
        state["projectKey"] = resolved
    return resolved


def get_control_plane_base_url(state: dict[str, Any]) -> str:
    base = str(
        state.get("controlPlaneBaseUrl")
        or os.environ.get("CONTROL_PLANE_API_BASE_URL")
        or "http://127.0.0.1:3210"
    )
    return base.rstrip("/")


def test_session_valid(state: dict[str, Any]) -> bool:
    token = str((state.get("session") or {}).get("token") or "").strip()
    expires = parse_iso((state.get("session") or {}).get("expiresAt"))
    return bool(token and expires and expires > datetime.now(timezone.utc))


def test_model_lease_valid(state: dict[str, Any]) -> bool:
    lease = state.get("modelLease") or {}
    token = str(lease.get("token") or "").strip()
    expires = parse_iso(lease.get("expiresAt"))
    return bool(token and expires and expires > datetime.now(timezone.utc))


def resolve_effective_workspace_path(state: dict[str, Any]) -> str:
    current_release = str(state.get("currentReleasePath") or "").strip()
    if current_release and Path(current_release).exists():
        return current_release
    workspace = str(state.get("workspacePath") or "").strip()
    if workspace and Path(workspace).exists():
        return workspace
    if REPO_ROOT.exists():
        return str(REPO_ROOT)
    return ""


def resolve_workspace_tool_path(state: dict[str, Any], relative_path: str) -> str:
    workspace = resolve_effective_workspace_path(state)
    if not workspace:
        return ""
    candidate = Path(workspace) / relative_path.replace("\\", "/")
    return str(candidate)


def run_command(
    args: list[str],
    *,
    cwd: str | Path | None = None,
    env: dict[str, str] | None = None,
    check: bool = True,
    capture: bool = True,
) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        env=merged_env,
        check=check,
        text=True,
        capture_output=capture,
    )


def assert_linux_supported() -> None:
    if sys.platform != "linux":
        raise RuntimeError("Ubuntu client only supports Linux.")


def sha256_file(file_path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(file_path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def update_installed_versions_list(state: dict[str, Any], version: str) -> None:
    current = [str(item) for item in state.get("installedVersions") or [] if str(item).strip()]
    state["installedVersions"] = [version] + [item for item in current if item != version]
    state["installedVersions"] = state["installedVersions"][:10]


def write_json_result(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def resolve_control_plane_url(base_url: str, path: str) -> str:
    normalized = path if path.startswith("/") else f"/{path}"
    if base_url.endswith("/api") and normalized.startswith("/api/"):
        return base_url + normalized[4:]
    return base_url + normalized


def invoke_control_plane_json(
    state: dict[str, Any],
    path: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    session_token: str = "",
    admin_token: str = "",
    timeout: int = 30,
) -> dict[str, Any]:
    url = resolve_control_plane_url(get_control_plane_base_url(state), path)
    request = urllib.request.Request(url=url, method=method.upper())
    request.add_header("Content-Type", "application/json")
    if session_token:
        request.add_header("Authorization", f"Bearer {session_token}")
    if admin_token:
        request.add_header("X-Control-Plane-Admin-Token", admin_token)
    payload = None
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
    try:
        with urllib.request.urlopen(request, data=payload, timeout=timeout) as response:
            response_text = response.read().decode("utf-8")
            return json.loads(response_text or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(detail or str(error)) from error


def sync_bootstrap_files() -> str:
    ensure_layout()
    source_dir = Path(__file__).resolve().parent
    for item in source_dir.iterdir():
        if item.name == "__pycache__":
            continue
        target = BOOTSTRAP_ROOT / item.name
        if item.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)
    openclaw_script = REPO_ROOT / "tools" / "install-openclaw-latest.sh"
    if openclaw_script.exists():
        shutil.copy2(openclaw_script, BOOTSTRAP_ROOT / openclaw_script.name)
    return str(BOOTSTRAP_ROOT)


def extract_zip(archive_path: str | Path, destination: str | Path) -> None:
    destination_path = Path(destination)
    if destination_path.exists():
        shutil.rmtree(destination_path)
    destination_path.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(destination_path)


def mark_background_update(
    state: dict[str, Any],
    status: str,
    stage: str,
    message: str,
    release_version: str = "",
) -> None:
    state["backgroundUpdate"] = {
        "status": status,
        "stage": stage,
        "releaseVersion": release_version,
        "message": message,
        "updatedAt": utc_now_iso(),
    }
    save_state(state)
