#!/usr/bin/env bash
# Deploy one disposable production candidate for the recovery rehearsal.
#
# Sourced by .github/workflows/recovery-rehearsal.yml, which needs this twice and
# should not carry two copies of it.
#
# Two placement rules, each learned from its own failure against the real API:
#   - the project's Root Directory must EXIST under --cwd, or the CLI refuses
#     with "The provided path ... does not exist";
#   - --prebuilt then reads .vercel/output from the --cwd itself, which is also
#     where `vercel build` writes it in a real release.
#
# No --skip-domain: the candidate is left to become production on deploy. The
# preview project is on the Hobby plan, where a rollback may only reach the
# immediately previous production deployment, so staging both candidates first
# put the target two steps away and Vercel answered HTTP 402.

deploy_rehearsal_candidate() {
    local label="$1"
    local dir="$RUNNER_TEMP/rehearsal-$label"

    rm -rf "$dir"
    mkdir -p "$dir${ROOT_DIRECTORY:+/$ROOT_DIRECTORY}"
    mkdir -p "$dir/.vercel/output/static"
    printf '{"version":3}' > "$dir/.vercel/output/config.json"
    printf 'recovery rehearsal %s for run %s\n' "$label" "$GITHUB_RUN_ID" \
        > "$dir/.vercel/output/static/index.html"

    if ! pnpm exec vercel deploy --cwd "$dir" \
        --prebuilt --prod --yes --json \
        --token="$VERCEL_TOKEN" \
        --meta "gitCommitSha=$GITHUB_SHA" \
        --meta "githubCommitSha=$GITHUB_SHA" \
        --meta "githubRunId=$GITHUB_RUN_ID" \
        --meta "recoveryRehearsal=1" \
        > "$dir/deploy.json" 2> "$dir/deploy.err"; then
        echo "vercel deploy failed for candidate $label:" >&2
        sed 's/^/    /' "$dir/deploy.err" >&2 || true
        head -c 600 "$dir/deploy.json" | sed 's/^/    /' >&2 || true
        return 1
    fi

    local id
    if ! id="$(jq -er '(.deployment // .).id | select(type == "string")' "$dir/deploy.json" 2>/dev/null)"; then
        # Say what actually came back rather than leaving a jq parse error to be
        # decoded — the rule this whole workflow exists to enforce.
        echo "vercel deploy returned no deployment id for candidate $label." >&2
        echo "  stdout:" >&2
        head -c 600 "$dir/deploy.json" | sed 's/^/    /' >&2 || true
        echo "  stderr:" >&2
        head -c 600 "$dir/deploy.err" | sed 's/^/    /' >&2 || true
        return 1
    fi
    printf '%s' "$id"
}
