#!/usr/bin/env bash
# Bump the package to a new upstream ASICSeer release and open a pull request.
#
#   scripts/auto-bump.sh <upstream-tag>      e.g. scripts/auto-bump.sh v1.5.5
#
# Sets startos/versions/current.ts to `<upstream>:0` (a new upstream always
# starts at package revision 0), resets ALLOW_DOWNGRADE to false, updates
# `ARG ASICSEER_REF` in the Dockerfile, then commits on `auto-bump/<tag>` and
# opens a PR against master. Merging the PR is what releases it. Check that
# every patch in patches/apply.py still applies to the new source first.
#
# DRY_RUN=1 edits and commits locally but skips the push and the PR.
set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "Usage: $0 <upstream-tag>" >&2
  exit 1
fi
TAG="v${TAG#v}"
UPSTREAM="${TAG#v}"
CURRENT_FILE=startos/versions/current.ts

CURRENT_VERSION=$(sed -nE "s/^[[:space:]]*version:[[:space:]]*'([^']+)'.*/\1/p" "$CURRENT_FILE" | head -1)
CURRENT_UPSTREAM="${CURRENT_VERSION%%:*}"
if [ "$CURRENT_UPSTREAM" = "$UPSTREAM" ]; then
  echo "Already at $UPSTREAM — no bump needed"
  exit 0
fi
# Never move the version downwards: StartOS cannot migrate to a lower upstream.
HIGHEST=$(printf '%s\n%s\n' "$CURRENT_UPSTREAM" "$UPSTREAM" | sort -V | tail -1)
if [ "$HIGHEST" = "$CURRENT_UPSTREAM" ]; then
  echo "::warning::Tag $TAG is older than the packaged version $CURRENT_UPSTREAM — refusing to downgrade"
  exit 0
fi
NEW_VERSION="${UPSTREAM}:0"
echo "Bumping $CURRENT_VERSION -> $NEW_VERSION"

python3 - "$CURRENT_FILE" "$NEW_VERSION" "$UPSTREAM" <<'PY'
import re, sys
path, new_version, upstream = sys.argv[1:]
src = open(path).read()
src, n = re.subn(r"(\n\s*version:\s*)'[^']+'", rf"\g<1>'{new_version}'", src, count=1)
assert n == 1, 'version line not found'
# Release notes are rewritten for review in the PR; translations are added there.
src, n = re.subn(
    r"releaseNotes:\s*(\{.*?\n  \}|'[^']*'|`[^`]*`),",
    "releaseNotes: {\n    en_US: 'Updates ASICSeer to upstream " + upstream + ".',\n  },",
    src, count=1, flags=re.S)
assert n == 1, 'releaseNotes not found'
src = re.sub(r"const ALLOW_DOWNGRADE = (true|false)", "const ALLOW_DOWNGRADE = false", src)
open(path, 'w').write(src)
PY

sed -i -E "s|^ARG ASICSEER_REF=.*|ARG ASICSEER_REF=${TAG}|" Dockerfile

BRANCH="auto-bump/${TAG}"
git checkout -b "$BRANCH"
git add "$CURRENT_FILE" Dockerfile
git -c user.name="github-actions[bot]" \
    -c user.email="github-actions[bot]@users.noreply.github.com" \
    commit -m "feat: bump ASICSeer to upstream ${TAG} (${NEW_VERSION})"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN: committed on $BRANCH, not pushed"
  exit 0
fi

git push origin "$BRANCH"
gh pr create --base master --head "$BRANCH" \
  --title "Bump ASICSeer to upstream ${TAG} (${NEW_VERSION})" \
  --body "Automated bump to upstream ASICSeer ${TAG}. Check that patches/apply.py still applies and review the release notes (add translations) before merging; merging releases ${NEW_VERSION}."
