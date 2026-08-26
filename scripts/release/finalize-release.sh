#!/usr/bin/env bash
set -euo pipefail

classification_only=false
if [[ "${1:-}" == --classify-only ]]; then
  classification_only=true
  shift
fi
candidate_dir=${1:?candidate directory is required}
provenance="$candidate_dir/release-provenance.json"
bundle="$candidate_dir/bodygroovn-v6.0.0.git.bundle"
zxp="$candidate_dir/bodygroovn-v6.0.0.zxp"
sidecar="$candidate_dir/bodygroovn-v6.0.0.zxp.sha256"
: "${GH_REPO:?GH_REPO is required}"

json_value() {
  node -e 'const fs=require("node:fs"); const value=process.argv.slice(2).reduce((current,key)=>current[key],JSON.parse(fs.readFileSync(process.argv[1],"utf8"))); if (typeof value !== "string" && typeof value !== "number") process.exit(2); process.stdout.write(String(value))' "$provenance" "$@"
}

release_sha=$(json_value release commit)
release_tree=$(json_value release tree)
pr_number=$(json_value pullRequest number)
pr_base=$(json_value pullRequest base sha)
pr_head=$(json_value pullRequest head sha)
candidate_run=$(json_value candidate runId)
candidate_attempt=$(json_value candidate runAttempt)
zxp_digest=$(json_value artifacts bodygroovn-v6.0.0.zxp)
release_body=$(printf 'First independently maintained bodygroovn release.\n\nPull request: #%s\nCandidate run: %s/%s\nRelease commit: %s\nZXP SHA-256: %s' "$pr_number" "$candidate_run" "$candidate_attempt" "$release_sha" "$zxp_digest")

file_digest() {
  node -e 'const fs=require("node:fs");const crypto=require("node:crypto");process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$1"
}

classify_remote_main() {
  local current_main merge_commit workflow_commit recovery_commit parents changed_paths
  local first_parent extra_parent
  current_main=$(git ls-remote origin refs/heads/main | cut -f1)
  [[ "$current_main" =~ ^[0-9a-f]{40}$ ]] || {
    echo 'Remote main does not resolve to a commit' >&2
    return 1
  }

  if [[ "$current_main" == "$pr_base" ]]; then
    printf 'base:%s\n' "$current_main"
    return 0
  fi
  if [[ "$current_main" == "$release_sha" ]]; then
    printf 'release:%s\n' "$current_main"
    return 0
  fi

  [[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ && "$current_main" == "$GITHUB_SHA" ]] || {
    echo 'Remote main is neither a normal release state nor the dispatched workflow commit' >&2
    return 1
  }
  workflow_commit=$current_main
  merge_commit=$(gh api "repos/$GH_REPO/pulls/$pr_number" --jq .merge_commit_sha)
  [[ "$merge_commit" =~ ^[0-9a-f]{40}$ ]] || {
    echo 'Merged pull request does not expose an exact merge commit' >&2
    return 1
  }
  [[ "$pr_number" == 4 \
    && "$candidate_run" == 32945716114 \
    && "$candidate_attempt" == 1 \
    && "$pr_base" == 88a43b7099612335fb5eb315eda1dccaee4a736d \
    && "$pr_head" == bf5b1e555e40f36dc3e2dfebfd11f0c01c5a97a0 \
    && "$release_sha" == e8aaded4e1d9b68ca115db11dab1bc42b3d62df2 \
    && "$merge_commit" == dfeff65e18ef286f9fc73afcea256dc640450b04 \
    && "$zxp_digest" == e35c4bdd99bbc9032b52a9cd061f902da861f213d33f8096a9e891345e1f03b9 ]] || {
    echo 'Manual-merge recovery does not match the one-shot v6.0.0 candidate identity' >&2
    return 1
  }
  if ! git cat-file -e "$pr_base^{commit}" 2>/dev/null \
    || ! git cat-file -e "$pr_head^{commit}" 2>/dev/null \
    || ! git cat-file -e "$merge_commit^{commit}" 2>/dev/null \
    || ! git cat-file -e "$workflow_commit^{commit}" 2>/dev/null; then
    echo 'Manual-merge recovery graph is incomplete' >&2
    return 1
  fi
  [[ "$(git show -s --format='%H %P' "$merge_commit")" == "$merge_commit $pr_base $pr_head" ]] || {
    echo 'Merged pull request commit parents do not match the recorded base and tested head' >&2
    return 1
  }
  [[ "$(git rev-parse "$merge_commit^{tree}")" == "$(git rev-parse "$pr_head^{tree}")" ]] || {
    echo 'Merged pull request commit tree does not match the tested head' >&2
    return 1
  }

  parents=$(git show -s --format='%H %P' "$workflow_commit")
  read -r _ first_parent recovery_commit extra_parent <<<"$parents"
  [[ -z "${extra_parent:-}" && "$first_parent" == "$merge_commit" \
    && "$recovery_commit" =~ ^[0-9a-f]{40}$ ]] || {
    echo 'Workflow commit is not the exact two-parent recovery merge' >&2
    return 1
  }
  [[ "$(git show -s --format='%H %P' "$recovery_commit")" == "$recovery_commit $merge_commit" ]] || {
    echo 'Recovery commit does not have only the merged pull request commit as its parent' >&2
    return 1
  }
  [[ "$(git rev-parse "$workflow_commit^{tree}")" == "$(git rev-parse "$recovery_commit^{tree}")" ]] || {
    echo 'Workflow merge tree does not match the recovery commit tree' >&2
    return 1
  }
  changed_paths=$(git diff --name-status --no-renames "$merge_commit..$workflow_commit" | LC_ALL=C sort)
  [[ "$changed_paths" == $'M\t.github/workflows/release-finalize.yml\nM\tscripts/release/bootstrap-contract.test.mjs\nM\tscripts/release/finalize-release.sh' ]] || {
    echo 'Manual-merge recovery changes files outside the exact trusted recovery set' >&2
    return 1
  }

  printf 'manual-merge:%s\n' "$current_main"
}

verify_release_assets() {
  local release_id=$1
  local asset name local_digest names_output remote_digest
  names_output=$(gh api "repos/$GH_REPO/releases/$release_id/assets" --paginate --jq '.[].name' | LC_ALL=C sort)
  [[ "$names_output" == $'bodygroovn-v6.0.0.zxp\nbodygroovn-v6.0.0.zxp.sha256' ]] || {
    echo 'Release asset inventory mismatch' >&2
    return 1
  }
  for asset in "$zxp" "$sidecar"; do
    name=$(basename "$asset")
    local_digest=$(file_digest "$asset")
    remote_digest=$(gh api "repos/$GH_REPO/releases/$release_id/assets" --paginate --jq ".[] | select(.name == \"$name\") | .digest")
    [[ "$remote_digest" == "sha256:$local_digest" ]] || {
      echo "Release asset digest mismatch for $name" >&2
      return 1
    }
  done
}

verify_remote_release_refs() {
  local current_main current_tag
  current_main=$(git ls-remote origin refs/heads/main | cut -f1)
  current_tag=$(git ls-remote origin 'refs/tags/v6.0.0^{}' | cut -f1)
  [[ "$current_main" == "$release_sha" ]] || {
    echo 'Remote main no longer matches the release commit' >&2
    return 1
  }
  [[ "$current_tag" == "$release_sha" ]] || {
    echo 'Remote v6.0.0 no longer resolves to the release commit' >&2
    return 1
  }
}

verify_release_identity() {
  local release_id=$1
  local expected_draft=$2
  local actual
  actual=$(gh api "repos/$GH_REPO/releases/$release_id" --jq .tag_name)
  [[ "$actual" == v6.0.0 ]] || { echo 'Release tag identity mismatch' >&2; return 1; }
  actual=$(gh api "repos/$GH_REPO/releases/$release_id" --jq .name)
  [[ "$actual" == 'bodygroovn v6.0.0' ]] || { echo 'Release name identity mismatch' >&2; return 1; }
  actual=$(gh api "repos/$GH_REPO/releases/$release_id" --jq .target_commitish)
  [[ "$actual" == "$release_sha" ]] || { echo 'Release target identity mismatch' >&2; return 1; }
  actual=$(gh api "repos/$GH_REPO/releases/$release_id" --jq .body)
  [[ "$actual" == "$release_body" ]] || { echo 'Release body identity mismatch' >&2; return 1; }
  actual=$(gh api "repos/$GH_REPO/releases/$release_id" --jq .draft)
  [[ "$actual" == "$expected_draft" ]] || { echo 'Release draft state mismatch' >&2; return 1; }
  actual=$(gh api "repos/$GH_REPO/releases/$release_id" --jq .prerelease)
  [[ "$actual" == false ]] || { echo 'Release prerelease state mismatch' >&2; return 1; }
}

create_release_draft() {
  local actual_assets actual_body actual_draft actual_name actual_prerelease actual_tag
  local attempt created_id response
  for ((attempt = 1; attempt <= 30; attempt += 1)); do
    response=$(gh api --method POST "repos/$GH_REPO/releases" \
      -f tag_name=v6.0.0 \
      -f target_commitish="$release_sha" \
      -f name='bodygroovn v6.0.0' \
      -f body="$release_body" \
      -F draft=true \
      -F prerelease=false)
    created_id=$(jq -er '.id | select(type == "number" and . > 0) | tostring' <<<"$response")
    actual_tag=$(jq -er '.tag_name | select(type == "string")' <<<"$response")
    actual_name=$(jq -er '.name | select(type == "string")' <<<"$response")
    actual_body=$(jq -er '.body | select(type == "string")' <<<"$response")
    actual_draft=$(jq -er '.draft | select(type == "boolean") | tostring' <<<"$response")
    actual_prerelease=$(jq -er '.prerelease | select(type == "boolean") | tostring' <<<"$response")
    actual_assets=$(jq -er '.assets | select(type == "array") | length' <<<"$response")

    if [[ "$actual_tag" == v6.0.0 ]]; then
      [[ "$actual_name" == 'bodygroovn v6.0.0' \
        && "$actual_body" == "$release_body" \
        && "$actual_draft" == true \
        && "$actual_prerelease" == false \
        && "$actual_assets" == 0 ]] || {
        echo 'New v6.0.0 draft identity mismatch' >&2
        return 1
      }
      draft_id=$created_id
      return 0
    fi

    [[ "$actual_tag" == untagged-* \
      && "$actual_draft" == true \
      && "$actual_assets" == 0 ]] || {
      echo "Unexpected draft response while waiting for v6.0.0: $actual_tag" >&2
      return 1
    }
    gh api --method DELETE "repos/$GH_REPO/releases/$created_id" --silent
    if (( attempt < 30 )); then
      echo "GitHub has not indexed v6.0.0 yet; retrying draft creation in 5 seconds ($attempt/30)."
      sleep 5
    fi
  done
  echo 'GitHub did not create a v6.0.0 draft after 30 attempts' >&2
  return 1
}

[[ "$release_sha" =~ ^[0-9a-f]{40}$ && "$release_tree" =~ ^[0-9a-f]{40}$ ]] \
  || { echo 'Invalid release commit identity' >&2; exit 1; }
[[ "$pr_base" =~ ^[0-9a-f]{40}$ && "$pr_head" =~ ^[0-9a-f]{40}$ ]] \
  || { echo 'Invalid pull request commit identity' >&2; exit 1; }
[[ "$pr_number" =~ ^[1-9][0-9]*$ && "$candidate_run" =~ ^[1-9][0-9]*$ \
  && "$candidate_attempt" =~ ^[1-9][0-9]*$ ]] \
  || { echo 'Invalid candidate numeric identity' >&2; exit 1; }
[[ "$zxp_digest" =~ ^[0-9a-f]{64}$ ]] \
  || { echo 'Invalid candidate ZXP digest' >&2; exit 1; }

if [[ "$classification_only" == true ]]; then
  classify_remote_main
  exit 0
fi

[[ -f "$bundle" && ! -L "$bundle" && -f "$zxp" && ! -L "$zxp" \
  && -f "$sidecar" && ! -L "$sidecar" ]] \
  || { echo 'Candidate release files are missing or unsafe' >&2; exit 1; }

git bundle verify "$bundle" >/dev/null
bundle_heads_output=$(git bundle list-heads "$bundle")
[[ "$bundle_heads_output" == "$release_sha refs/bodygroovn/release-candidate" ]] \
  || { echo 'Release bundle ref identity mismatch' >&2; exit 1; }
git fetch --quiet "$bundle" refs/bodygroovn/release-candidate:refs/bodygroovn/release-candidate
[[ "$(git rev-parse refs/bodygroovn/release-candidate)" == "$release_sha" ]] \
  || { echo 'Release bundle commit mismatch' >&2; exit 1; }
[[ "$(git show -s --format='%H %P' refs/bodygroovn/release-candidate)" == "$release_sha $pr_head" ]] \
  || { echo 'Release commit must have exactly the pull request head as its only parent' >&2; exit 1; }
[[ "$(git rev-parse 'refs/bodygroovn/release-candidate^{tree}')" == "$release_tree" ]] \
  || { echo 'Release bundle tree mismatch' >&2; exit 1; }
[[ "$(git log -1 --pretty=%s refs/bodygroovn/release-candidate)" == 'chore(release): v6.0.0' ]] \
  || { echo 'Release bundle commit message mismatch' >&2; exit 1; }
git merge-base --is-ancestor "$pr_base" "$pr_head" \
  || { echo 'Pull request head does not descend from the recorded base' >&2; exit 1; }

node scripts/verify-sha256-sidecar.mjs "$zxp" "$sidecar"

published_ids_output=$(gh api --paginate "repos/$GH_REPO/releases?per_page=100" --jq '.[] | select(.draft == false and .tag_name == "v6.0.0") | .id')
if [[ "$published_ids_output" == *$'\n'* ]]; then
  echo 'More than one published v6.0.0 release exists' >&2
  exit 1
fi
if [[ -n "$published_ids_output" ]]; then
  published_id=$published_ids_output
  verify_remote_release_refs
  verify_release_identity "$published_id" false
  verify_release_assets "$published_id"
  echo "Verified already-published v6.0.0 from pull request #$pr_number at $release_sha."
  exit 0
fi

main_classification=$(classify_remote_main)
remote_state=${main_classification%%:*}
remote_main=${main_classification#*:}
remote_tag=$(git ls-remote origin 'refs/tags/v6.0.0^{}' | cut -f1)
if [[ "$remote_state" == base || "$remote_state" == manual-merge ]]; then
  [[ -z "$remote_tag" ]] || { echo 'v6.0.0 already exists before the atomic release push' >&2; exit 1; }
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git tag -a v6.0.0 "$release_sha" -m 'Release bodygroovn v6.0.0'
  git push --atomic \
    --force-with-lease="refs/heads/main:$remote_main" \
    origin \
    "$release_sha:refs/heads/main" \
    refs/tags/v6.0.0
elif [[ "$remote_state" == release ]]; then
  [[ "$remote_tag" == "$release_sha" ]] || {
    echo 'Recovery found release main without the expected tag' >&2
    exit 1
  }
else
  echo 'Unexpected classified remote main state' >&2
  exit 1
fi

verify_remote_release_refs

draft_ids_output=$(gh api --paginate "repos/$GH_REPO/releases?per_page=100" --jq '.[] | select(.draft == true and .tag_name == "v6.0.0") | .id')
if [[ "$draft_ids_output" == *$'\n'* ]]; then
  echo 'More than one v6.0.0 draft exists' >&2
  exit 1
fi
if [[ -z "$draft_ids_output" ]]; then
  create_release_draft
else
  draft_id=$draft_ids_output
fi
verify_release_identity "$draft_id" true

asset_names_output=$(gh api "repos/$GH_REPO/releases/$draft_id/assets" --paginate --jq '.[].name')
if [[ -n "$asset_names_output" ]]; then
  while IFS= read -r name; do
    [[ "$name" == bodygroovn-v6.0.0.zxp || "$name" == bodygroovn-v6.0.0.zxp.sha256 ]] || {
      echo "Unexpected draft asset: $name" >&2
      exit 1
    }
  done <<<"$asset_names_output"
fi
for asset in "$zxp" "$sidecar"; do
  name=$(basename "$asset")
  if ! grep -Fxq "$name" <<<"$asset_names_output"; then
    gh release upload v6.0.0 "$asset" --repo "$GH_REPO"
  fi
done

verify_release_identity "$draft_id" true
verify_release_assets "$draft_id"
verify_remote_release_refs

gh api --method PATCH "repos/$GH_REPO/releases/$draft_id" \
  -f target_commitish="$release_sha" \
  -f name='bodygroovn v6.0.0' \
  -f body="$release_body" \
  -F prerelease=false \
  -F draft=false >/dev/null

verify_release_identity "$draft_id" false
verify_release_assets "$draft_id"
verify_remote_release_refs

echo "Published v6.0.0 from pull request #$pr_number at $release_sha with exactly two assets."
