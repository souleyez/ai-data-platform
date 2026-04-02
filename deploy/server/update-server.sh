#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/ai-data-platform}"
BRANCH="${BRANCH:-master}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
INSTALL_CMD="${INSTALL_CMD:-corepack pnpm install --frozen-lockfile}"
BUILD_PACKAGES="${BUILD_PACKAGES:-api control-plane-api control-plane-web web worker}"
SERVICES="${SERVICES:-ai-data-platform-model-bridge ai-data-platform-api ai-data-platform-worker ai-data-platform-web ai-data-platform-control-plane-api ai-data-platform-control-plane-web}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3100/api/health}"
CONTROL_PLANE_HEALTH_URL="${CONTROL_PLANE_HEALTH_URL:-http://127.0.0.1:3210/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-20}"
HEALTH_RETRY_INTERVAL="${HEALTH_RETRY_INTERVAL:-2}"
REMOTE_WORKTREE_MODE="${REMOTE_WORKTREE_MODE:-fail}"
PREFLIGHT_ONLY="${PREFLIGHT_ONLY:-0}"
STASH_MESSAGE="${STASH_MESSAGE:-ai-data-platform deploy preflight $(date -u +%Y%m%dT%H%M%SZ)}"
DIRTY_WORKTREE_EXIT_CODE="${DIRTY_WORKTREE_EXIT_CODE:-42}"
SYSTEMD_UNIT_DIR="${SYSTEMD_UNIT_DIR:-/etc/systemd/system}"

if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  echo "Project directory is not a git repository: $PROJECT_DIR" >&2
  exit 1
fi

cd "$PROJECT_DIR"

collect_worktree_status() {
  git status --porcelain=v1 --untracked-files=all
}

normalize_status_path() {
  local raw_path="${1:-}"
  local normalized="${raw_path%\"}"
  normalized="${normalized#\"}"
  normalized="${normalized//\\/\/}"
  while [[ "$normalized" == *'//'*
  ]]; do
    normalized="${normalized//\/\//\/}"
  done
  printf '%s' "${normalized,,}"
}

is_protected_worktree_path() {
  local normalized
  normalized="$(normalize_status_path "$1")"
  [[ "$normalized" == storage/files/uploads/* ]] && return 0
  [[ "$normalized" == */storage/files/uploads/* ]] && return 0
  [[ "$normalized" == deploy/server/*.env ]] && return 0
  [[ "$normalized" == */deploy/server/*.env ]] && return 0
  return 1
}

filter_worktree_status() {
  local mode="${1:-blocking}"
  local status_lines="${2:-}"
  local matched=()

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    local path_part="${line:3}"
    local is_protected='false'
    if is_protected_worktree_path "$path_part"; then
      is_protected='true'
    fi

    if [[ "$mode" == "protected" && "$is_protected" == 'true' ]]; then
      matched+=("$line")
    fi
    if [[ "$mode" == "blocking" && "$is_protected" != 'true' ]]; then
      matched+=("$line")
    fi
  done <<< "$status_lines"

  printf '%s\n' "${matched[@]}"
}

print_status_lines() {
  local status_lines="${1:-}"
  local heading="${2:-Remote worktree is dirty:}"
  if [[ -z "$status_lines" ]]; then
    echo "Remote worktree is clean."
    return 0
  fi

  echo "$heading"
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    echo "  $line"
  done <<< "$status_lines"
}

stash_safe_worktree_paths() {
  git stash push \
    --include-untracked \
    --message "$STASH_MESSAGE" \
    -- \
    . \
    ':(exclude)storage/files/uploads' \
    ':(exclude)deploy/server/ai-data-platform.env' \
    ':(glob,exclude)deploy/server/*.env'
}

ensure_remote_worktree_ready() {
  local raw_status_lines
  raw_status_lines="$(collect_worktree_status)"
  local blocking_status_lines
  blocking_status_lines="$(filter_worktree_status blocking "$raw_status_lines")"
  local protected_status_lines
  protected_status_lines="$(filter_worktree_status protected "$raw_status_lines")"

  if [[ -z "$blocking_status_lines" ]]; then
    echo "==> Remote worktree preflight: clean"
    if [[ -n "$protected_status_lines" ]]; then
      print_status_lines "$protected_status_lines" "Protected runtime paths are dirty but ignored for deploy:"
    fi
    return 0
  fi

  echo "==> Remote worktree preflight: dirty"
  print_status_lines "$blocking_status_lines"
  if [[ -n "$protected_status_lines" ]]; then
    print_status_lines "$protected_status_lines" "Protected runtime paths ignored for deploy:"
  fi

  case "$REMOTE_WORKTREE_MODE" in
    fail)
      echo "Remote deploy blocked because the worktree is dirty. Re-run with REMOTE_WORKTREE_MODE=stash-safe only if those repo changes can be stashed safely." >&2
      return "$DIRTY_WORKTREE_EXIT_CODE"
      ;;
    stash-safe)
      echo "==> Remote worktree preflight: stashing safe repo paths"
      stash_safe_worktree_paths
      raw_status_lines="$(collect_worktree_status)"
      blocking_status_lines="$(filter_worktree_status blocking "$raw_status_lines")"
      protected_status_lines="$(filter_worktree_status protected "$raw_status_lines")"
      if [[ -n "$blocking_status_lines" ]]; then
        echo "Remote worktree is still dirty after stash-safe. Remaining paths require manual cleanup." >&2
        print_status_lines "$blocking_status_lines"
        if [[ -n "$protected_status_lines" ]]; then
          print_status_lines "$protected_status_lines" "Protected runtime paths ignored for deploy:"
        fi
        return "$DIRTY_WORKTREE_EXIT_CODE"
      fi
      echo "==> Remote worktree preflight: cleared by stash-safe"
      if [[ -n "$protected_status_lines" ]]; then
        print_status_lines "$protected_status_lines" "Protected runtime paths remain untouched:"
      fi
      ;;
    *)
      echo "Unsupported REMOTE_WORKTREE_MODE: $REMOTE_WORKTREE_MODE" >&2
      return 2
      ;;
  esac
}

wait_for_health() {
  local url="${1:-$HEALTH_URL}"
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  local last_error=''
  local health_output=''

  while true; do
    if health_output="$(curl --fail --silent --show-error --max-time "$HEALTH_RETRY_INTERVAL" "$url" 2>&1)"; then
      printf '%s\n' "$health_output"
      return 0
    fi

    last_error="$health_output"
    if (( SECONDS >= deadline )); then
      [[ -n "$last_error" ]] && echo "$last_error" >&2
      echo "Health check did not recover within ${HEALTH_TIMEOUT}s." >&2
      return 1
    fi

    local remaining=$((deadline - SECONDS))
    local sleep_for="$HEALTH_RETRY_INTERVAL"
    if (( remaining < sleep_for )); then
      sleep_for="$remaining"
    fi
    [[ -n "$last_error" ]] && echo "$last_error" >&2
    echo "Health check not ready yet; retrying in ${sleep_for}s (${remaining}s remaining)." >&2
    sleep "$sleep_for"
  done
}

install_systemd_units() {
  echo "==> Installing systemd units"
  install -m 0644 deploy/server/systemd/*.service "$SYSTEMD_UNIT_DIR"/
  systemctl daemon-reload
  systemctl enable $SERVICES >/dev/null 2>&1 || true
}

ensure_remote_worktree_ready

if [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  echo "Preflight finished."
  exit 0
fi

echo "==> Fetching latest code"
git fetch "$REMOTE_NAME"
git checkout "$BRANCH"
git pull --ff-only "$REMOTE_NAME" "$BRANCH"

echo "==> Installing dependencies"
eval "$INSTALL_CMD"

echo "==> Building packages: $BUILD_PACKAGES"
for pkg in $BUILD_PACKAGES; do
  corepack pnpm --filter "$pkg" build
done

install_systemd_units

echo "==> Restarting services: $SERVICES"
systemctl restart $SERVICES
systemctl is-active $SERVICES

echo "==> Health check: $HEALTH_URL"
wait_for_health "$HEALTH_URL"
if [[ -n "$CONTROL_PLANE_HEALTH_URL" ]]; then
  echo "==> Health check: $CONTROL_PLANE_HEALTH_URL"
  wait_for_health "$CONTROL_PLANE_HEALTH_URL"
fi
echo "Deployment finished."
