#!/usr/bin/env bash
set -euo pipefail

if [[ ! "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::error::Invalid release version: $RELEASE_TAG"
  exit 1
fi

if [[ "$RELEASE_RANGE" == '--current' ]]; then
  test "$RELEASE_TAG" = "$LATEST_TAG"
  if gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
    exit 0
  fi
elif [[ "$RELEASE_TAG" == "$LATEST_TAG" ]]; then
  echo 'No version bump for this deployment.'
  exit 0
else
  gh api "repos/$GITHUB_REPOSITORY/git/refs" \
    -f ref="refs/tags/$RELEASE_TAG" -f sha="$GITHUB_SHA" --silent
fi

gh release create "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" \
  --verify-tag --draft --title "$RELEASE_TAG" --notes-file "$RUNNER_TEMP/release-notes.md"
