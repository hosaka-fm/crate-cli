/**
 * robot-docs.ts — the in-tool agent handbook (Axiom 9). Everything needed to drive `crate`
 * correctly, paste-ready, no external lookup. Plain markdown on stdout (it IS the data).
 */
import { API_VERSION_PIN, DEFAULT_BASE_URL } from './config.js';
import { CLI_VERSION } from './http.js';

export const ROBOT_DOCS = `# crate CLI — agent handbook (cli ${CLI_VERSION}, api pin ${API_VERSION_PIN})

The command-line door to the crate music-data API (${DEFAULT_BASE_URL}/api/v2).
Cluster-first: the canonical artist key is the 64-hex cluster_id. Have a name or link instead?
ALWAYS start at resolve.

## Quickstart (the three calls that cover 90% of tasks)

    crate resolve "Four Tet"                 # name/link/id → cluster_id + slug + locators
    crate artist <cluster_id|slug>           # everything crate knows, one call
    crate search "detroit techno" --genre Electronic --limit 10

## Auth (required for every data command except preview)

    export CRATE_API_KEY=ck_live_…           # or: crate auth set   (reads key from stdin)
    crate auth status                        # masked key + source + live check
Keyless → exit 2 with the fix (exception: \`crate preview\` needs no key — it is the education
teaser). Fresh keys can 401 for a few seconds (replica lag) — retry once.

## Output contract (rely on it)

- Piped/non-TTY → stdout is the RAW API JSON body, byte-deterministic. \`crate aura | jq .items\`
  works with zero flags. On a TTY you get human panels; force either with --json / --human.
- stdout = data ONLY. Every diagnostic/hint is stderr. Never grep stdout for errors.
- present:false = honest gap (the answer is "nothing is filed there") — exit 0, NOT an error.
- state:"degraded" = upstream read failed honestly — exit 0; treat as "retry later, do not trust empty".

## Exit codes (deterministic — write case statements against these)

    0 ok (incl. honest-gap/degraded)   1 usage   2 auth   3 invalid input (API 400)
    4 rate limited (Retry-After on stderr; NO auto-retry)   5 server 5xx   6 network   7 config

## Command reference

    crate resolve <query|url>  [--discogs N] [--mbid U] [--cluster HEX]
    crate artist <key> [--fields identity,discography]     # key = 64-hex cluster_id or slug
    crate master <key> <master_id>                         # a master dossier under its artist
    crate bandcamp <key> <item_id>                         # a Bandcamp release under its artist
    crate preview <name>                                   # KEYLESS teaser (capped artist slice)
    crate label <key>          crate festival <slug>
    crate search <q> [--genre G --style S --country C --label L --format F
                      --year-from Y --year-to Y --limit N --offset N --nl]
    crate facets [--genre G --style S --country C --year-from Y --year-to Y]
    crate artists [--genre G --style S --tier breakout|rising|steady
                   --sort discovery|reach --limit N --offset N]   # browse the artist grain
    crate aura [cluster_hex] [--limit N]                   # list (strongest first) or one artist
    crate breakouts [--tier breakout|rising] [--corroboration corroborated|booking_ahead]
    crate tastemakers [--ones-to-watch] [--limit N]
    crate manifest                                         # the data dictionary
    crate surface [name] [--cluster HEX --after CURSOR --limit N]  # producer-surface registry or rows
    crate api /api/v2/<path>?query…                        # raw authenticated GET (escape hatch)
    crate capabilities                                     # machine contract (JSON)
    crate triage                                           # auth + health + next commands, ONE call

## Recipes

    # no key yet? taste the data keyless, then get a key for the full dossier
    crate preview "Four Tet"

    # name → dossier, one pipeline
    crate resolve "Objekt" --json | jq -r .cluster_id | xargs crate artist

    # browse a genre, then drill into one artist's masters
    crate artists --genre Electronic --tier breakout --limit 10
    crate artist <key> --fields discography | jq  # master ids → crate master <key> <id>

    # strongest auras with measured break odds
    crate aura --limit 20 | jq '.items[] | {artist_name, convergence_dim_count, break_odds}'

    # is anything wrong? (auth, connectivity, api version) — one call
    crate triage

## Rate limits

Keyed responses carry X-RateLimit-Limit/-Remaining/-Reset. On 429 the CLI exits 4 and prints
Retry-After on stderr. Back off yourself; the CLI will never sleep or retry for you.
`;
