#!/usr/bin/env bash
set -euo pipefail

candidate_dir=${1:?candidate directory is required}
provenance="$candidate_dir/release-provenance.json"
release_sha=$(node -p "require('./$provenance').release.commit")
trigger_sha=$(node -p "require('./$provenance').release.parent")
zxp="$candidate_dir/bodygroovn-v6.0.0.zxp"
sidecar="$candidate_dir/bodygroovn-v6.0.0.zxp.sha256"
candidate_run=$(node -p "require('./$provenance').candidate.runId")
candidate_attempt=$(node -p "require('./$provenance').candidate.runAttempt")
zxp_digest=$(node -p "require('./$provenance').artifacts['bodygroovn-v6.0.0.zxp']")
release_body=$(printf 'First independently maintained bodygroovn release.\n\nCandidate run: %s/%s\nRelease commit: %s\nZXP SHA-256: %s' "$candidate_run" "$candidate_attempt" "$release_sha" "$zxp_digest")

mapfile -t draft_ids < <(gh api --paginate "repos/$GH_REPO/releases?per_page=100" --jq '.[] | select(.draft == true and .tag_name == "v6.0.0") | .id')
if (( ${#draft_ids[@]} > 1 )); then
  echo "More than one v6.0.0 draft exists" >&2
  exit 1
fi
if (( ${#draft_ids[@]} == 0 )); then
  draft_id=$(gh api --method POST "repos/$GH_REPO/releases" -f tag_name=v6.0.0 -f target_commitish="$release_sha" -f name='bodygroovn v6.0.0' -f body="$release_body" -F draft=true --jq .id)
else
  draft_id=${draft_ids[0]}
  draft_target=$(gh api "repos/$GH_REPO/releases/$draft_id" --jq .target_commitish)
  [[ "$draft_target" == "$release_sha" ]] || { echo "Existing draft target mismatch" >&2; exit 1; }
  draft_body=$(gh api "repos/$GH_REPO/releases/$draft_id" --jq .body)
  [[ "$draft_body" == "$release_body" ]] || { echo "Existing draft provenance mismatch" >&2; exit 1; }
fi

mapfile -t asset_names < <(gh api "repos/$GH_REPO/releases/$draft_id/assets" --paginate --jq '.[].name')
for name in "${asset_names[@]}"; do
  [[ "$name" == bodygroovn-v6.0.0.zxp || "$name" == bodygroovn-v6.0.0.zxp.sha256 ]] || { echo "Unexpected draft asset: $name" >&2; exit 1; }
done
for asset in "$zxp" "$sidecar"; do
  name=$(basename "$asset")
  if ! printf '%s\n' "${asset_names[@]}" | grep -Fxq "$name"; then
    gh release upload v6.0.0 "$asset" --repo "$GH_REPO"
  fi
done

node scripts/verify-sha256-sidecar.mjs "$zxp" "$sidecar"
for asset in "$zxp" "$sidecar"; do
  name=$(basename "$asset")
  expected_digest="sha256:$(sha256sum "$asset" | cut -d' ' -f1)"
  remote_digest=$(gh api "repos/$GH_REPO/releases/$draft_id/assets" --paginate --jq ".[] | select(.name == \"$name\") | .digest")
  [[ "$remote_digest" == "$expected_digest" ]] || { echo "Draft asset digest mismatch for $name" >&2; exit 1; }
done
remote_main=$(git ls-remote origin refs/heads/main | cut -f1)
if [[ "$remote_main" == "$trigger_sha" ]]; then
  git tag -a v6.0.0 "$release_sha" -m 'Release bodygroovn v6.0.0'
  git push --atomic --force-with-lease="refs/heads/main:$trigger_sha" origin "$release_sha:refs/heads/main" refs/tags/v6.0.0
elif [[ "$remote_main" == "$release_sha" ]]; then
  [[ "$(git ls-remote origin 'refs/tags/v6.0.0^{}' | cut -f1)" == "$release_sha" ]] || { echo "Recovery found release main without the expected tag" >&2; exit 1; }
else
  echo "Remote main is neither the trigger nor release commit" >&2
  exit 1
fi

[[ "$(git ls-remote origin refs/heads/main | cut -f1)" == "$release_sha" ]]
[[ "$(git ls-remote origin refs/tags/v6.0.0^{} | cut -f1)" == "$release_sha" ]]
[[ "$(gh api "repos/$GH_REPO/releases/$draft_id" --jq '.draft')" == true ]]
[[ "$(gh api "repos/$GH_REPO/releases/$draft_id" --jq '.target_commitish')" == "$release_sha" ]]
mapfile -t ready_assets < <(gh api "repos/$GH_REPO/releases/$draft_id/assets" --paginate --jq '.[].name' | sort)
[[ "${ready_assets[*]}" == 'bodygroovn-v6.0.0.zxp bodygroovn-v6.0.0.zxp.sha256' ]]
for asset in "$zxp" "$sidecar"; do
  name=$(basename "$asset")
  expected_digest="sha256:$(sha256sum "$asset" | cut -d' ' -f1)"
  [[ "$(gh api "repos/$GH_REPO/releases/$draft_id/assets" --paginate --jq ".[] | select(.name == \"$name\") | .digest")" == "$expected_digest" ]]
done
gh api --method PATCH "repos/$GH_REPO/releases/$draft_id" -f target_commitish="$release_sha" -F draft=false >/dev/null
[[ "$(gh api "repos/$GH_REPO/releases/$draft_id" --jq '.draft')" == false ]]
[[ "$(gh api "repos/$GH_REPO/releases/$draft_id" --jq '.target_commitish')" == "$release_sha" ]]
mapfile -t published_assets < <(gh api "repos/$GH_REPO/releases/$draft_id/assets" --paginate --jq '.[].name' | sort)
[[ "${published_assets[*]}" == 'bodygroovn-v6.0.0.zxp bodygroovn-v6.0.0.zxp.sha256' ]]
for asset in "$zxp" "$sidecar"; do
  name=$(basename "$asset")
  expected_digest="sha256:$(sha256sum "$asset" | cut -d' ' -f1)"
  [[ "$(gh api "repos/$GH_REPO/releases/$draft_id/assets" --paginate --jq ".[] | select(.name == \"$name\") | .digest")" == "$expected_digest" ]]
done
echo "Published v6.0.0 at $release_sha with exactly two assets."
