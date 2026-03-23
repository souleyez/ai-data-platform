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

if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  echo "Project directory is not a git repository: $PROJECT_DIR" >&2
  exit 1
fi

cd "$PROJECT_DIR"

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
