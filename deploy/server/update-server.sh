#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/ai-data-platform}"
BRANCH="${BRANCH:-master}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
INSTALL_CMD="${INSTALL_CMD:-corepack pnpm install --frozen-lockfile}"
BUILD_PACKAGES="${BUILD_PACKAGES:-api web worker}"
SERVICES="${SERVICES:-ai-data-platform-model-bridge ai-data-platform-api ai-data-platform-worker ai-data-platform-web}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3100/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-20}"
REMOTE_WORKTREE_MODE="${REMOTE_WORKTREE_MODE:-fail}"
PREFLIGHT_ONLY="${PREFLIGHT_ONLY:-0}"
STASH_MESSAGE="${STASH_MESSAGE:-ai-data-platform deploy preflight $(date -u +%Y%m%dT%H%M%SZ)}"
DIRTY_WORKTREE_EXIT_CODE="${DIRTY_WORKTREE_EXIT_CODE:-42}"

if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  echo "Project directory is not a git repository: $PROJECT_DIR" >&2
  exit 1
fi

cd "$PROJECT_DIR"

collect_worktree_status() {
  git status --porcelain=v1 --untracked-files=all
}

print_worktree_status() {
  local status_lines="${1:-}"
  if [[ -z "$status_lines" ]]; then
    echo "Remote worktree is clean."
    return 0
  fi

  echo "Remote worktree is dirty:"
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
  local status_lines
  status_lines="$(collect_worktree_status)"
  if [[ -z "$status_lines" ]]; then
    echo "==> Remote worktree preflight: clean"
    return 0
  fi

  echo "==> Remote worktree preflight: dirty"
  print_worktree_status "$status_lines"

  case "$REMOTE_WORKTREE_MODE" in
    fail)
      echo "Remote deploy blocked because the worktree is dirty. Re-run with REMOTE_WORKTREE_MODE=stash-safe only if those repo changes can be stashed safely." >&2
      return "$DIRTY_WORKTREE_EXIT_CODE"
      ;;
    stash-safe)
      echo "==> Remote worktree preflight: stashing safe repo paths"
      stash_safe_worktree_paths
      status_lines="$(collect_worktree_status)"
      if [[ -n "$status_lines" ]]; then
        echo "Remote worktree is still dirty after stash-safe. Remaining paths require manual cleanup." >&2
        print_worktree_status "$status_lines"
        return "$DIRTY_WORKTREE_EXIT_CODE"
      fi
      echo "==> Remote worktree preflight: cleared by stash-safe"
      ;;
    *)
      echo "Unsupported REMOTE_WORKTREE_MODE: $REMOTE_WORKTREE_MODE" >&2
      return 2
      ;;
  esac
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

echo "==> Restarting services: $SERVICES"
systemctl restart $SERVICES
systemctl is-active $SERVICES

echo "==> Health check: $HEALTH_URL"
curl --fail --silent --show-error --max-time "$HEALTH_TIMEOUT" "$HEALTH_URL"
echo
echo "Deployment finished."
