#!/usr/bin/env bash
set -euo pipefail

gh() {
  if [[ "$1 $2" == 'release view' ]]; then
    return "$DRAFT_LOOKUP_STATUS"
  fi
  printf '%s\n' "$*"
}
export -f gh

export GITHUB_REPOSITORY=example/cloud-otter GITHUB_SHA=deployed-commit
export RUNNER_TEMP=/tmp RELEASE_TAG=v0.1.0 DRAFT_LOOKUP_STATUS=1
create_draft='release create v0.1.0 --repo example/cloud-otter --verify-tag --draft --title v0.1.0 --notes-file /tmp/release-notes.md'
create_tag='api repos/example/cloud-otter/git/refs -f ref=refs/tags/v0.1.0 -f sha=deployed-commit --silent'

actual=$(RELEASE_RANGE='--unreleased --bump' LATEST_TAG='' bash scripts/create-release-draft.sh)
[[ "$actual" == "$create_tag"$'\n'"$create_draft" ]]

actual=$(RELEASE_RANGE='--unreleased --bump' LATEST_TAG=v0.1.0 bash scripts/create-release-draft.sh)
[[ "$actual" == 'No version bump for this deployment.' ]]

actual=$(RELEASE_RANGE=--current LATEST_TAG=v0.1.0 bash scripts/create-release-draft.sh)
[[ "$actual" == "$create_draft" ]]

actual=$(DRAFT_LOOKUP_STATUS=0 RELEASE_RANGE=--current LATEST_TAG=v0.1.0 bash scripts/create-release-draft.sh)
[[ -z "$actual" ]]

echo 'Release draft checks passed.'
