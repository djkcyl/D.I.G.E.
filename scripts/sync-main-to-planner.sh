#!/usr/bin/env bash
set -euo pipefail

REMOTE="origin"
MAIN_BRANCH="main"
PLANNER_BRANCH="planner"
PUSH=0
AUTOSTASH=1
STASH_CREATED=0
STASH_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      PUSH=1
      shift
      ;;
    --remote)
      REMOTE="$2"
      shift 2
      ;;
    --main)
      MAIN_BRANCH="$2"
      shift 2
      ;;
    --planner)
      PLANNER_BRANCH="$2"
      shift 2
      ;;
    --no-autostash)
      AUTOSTASH=0
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--push] [--remote <remote>] [--main <main-branch>] [--planner <planner-branch>] [--no-autostash]"
      exit 1
      ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repository."
  exit 1
fi

restore_stash() {
  if [[ "$STASH_CREATED" -eq 1 ]]; then
    git stash pop --index >/dev/null || true
  fi
}

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "$AUTOSTASH" -eq 1 ]]; then
    STASH_NAME="sync-main-to-planner-$(date +%s)"
    git stash push -u -m "$STASH_NAME" >/dev/null
    STASH_CREATED=1
  else
    echo "Working tree is not clean. Please commit/stash first, or run without --no-autostash."
    exit 1
  fi
fi

trap restore_stash EXIT

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

git fetch "$REMOTE"

if ! git show-ref --verify --quiet "refs/heads/$PLANNER_BRANCH"; then
  git switch -c "$PLANNER_BRANCH" "$REMOTE/$PLANNER_BRANCH"
else
  git switch "$PLANNER_BRANCH"
fi

git merge --no-edit "$REMOTE/$MAIN_BRANCH"

if [[ "$PUSH" -eq 1 ]]; then
  git push "$REMOTE" "$PLANNER_BRANCH"
fi

if [[ "$START_BRANCH" != "$PLANNER_BRANCH" ]]; then
  git switch "$START_BRANCH"
fi

trap - EXIT
restore_stash

echo "Synced $REMOTE/$MAIN_BRANCH -> $PLANNER_BRANCH"