# crate-cli

`crate` — the command-line door to the [crate](https://crate.hosaka.fm) music-data API.
**Built agents-first**: piped output is the raw API JSON (byte-deterministic), exit codes are a
documented dictionary, every error teaches the fix, and the docs live in the tool itself.
Humans get color panels on a TTY. Aligned with [clig.dev](https://clig.dev/).

```sh
npm install -g @hosaka-fm/crate-cli     # or: npx @hosaka-fm/crate-cli …
export CRATE_API_KEY=ck_live_…          # or: crate auth set   (reads from stdin)

crate resolve "Four Tet"                # name/link/id → the canonical cluster_id  (START HERE)
crate artist <cluster_id>               # everything crate knows about one artist, one call
crate aura --limit 10                   # multi-dimension convergence signals, strongest first
crate search "detroit techno" --genre Electronic
crate preview "Four Tet"                # no key yet? the KEYLESS education teaser
```

## For agents

```sh
crate robot-docs        # the paste-ready agent handbook — read this first
crate capabilities      # the machine contract: commands, exit codes, env, output rules (JSON)
crate triage            # ONE call: auth state + live API health + copy-paste next commands
```

- **Piped stdout is the untransformed API JSON** — `crate aura | jq '.items[0]'` works with zero
  flags. stdout is data ONLY; every diagnostic and hint is stderr.
- **Exit codes**: `0` ok (including `present:false` honest-gaps — an empty read is an answer),
  `1` usage, `2` auth, `3` invalid input, `4` rate-limited (Retry-After on stderr, no auto-retry),
  `5` server, `6` network, `7` config.
- `NO_COLOR`, `CI`, `TERM=dumb`, `--no-color`, and non-TTY all suppress styling.

## Commands

| Command | What it does |
|---|---|
| `resolve <name\|url>` | any identifier → canonical `cluster_id` + locators (the front door) |
| `artist <key>` | full dossier by 64-hex cluster_id or slug; `--fields` trims |
| `master <key> <id>` | a master (release-group) dossier addressed under its artist |
| `bandcamp <key> <item>` | a Bandcamp release addressed under its artist |
| `preview <name>` | **keyless** education teaser — a capped slice of the artist dossier |
| `label <key>` · `festival <slug>` | the other dossier grains |
| `search <q>` | faceted catalogue search (`--genre --style --country --year-from … --nl`) |
| `facets` | valid facet names + values |
| `artists` | browse the artist grain (`--genre --style --tier --sort --limit --offset`) |
| `aura [cluster]` | convergence signals (list, strongest first) or one artist |
| `breakouts` | emerging artists (`--tier`, `--corroboration`) |
| `tastemakers` | leaderboard; `--ones-to-watch` for the rising slice |
| `manifest` | the data dictionary — every field + provenance |
| `surface [name]` | generic cluster-keyed producer surfaces — registry index, or `--cluster <hex>` for one surface's rows |
| `api <path>` | raw authenticated GET against any `/api/v2` path (escape hatch) |
| `auth set/status/unset` | key management (config file, `0600`, XDG-honoring) |

## Keys & docs

Get a key at [crate.hosaka.fm](https://crate.hosaka.fm); docs at
[crate-sdk.hosaka.fm](https://crate-sdk.hosaka.fm). The CLI is built against API spec
`2.14.0`, vendored at `contracts/spec.json` (`tests/parity.test.ts` pins this README to the
real pin — it cannot silently drift again).

## Development

```sh
npm install && npm test        # builds, then runs unit + contract + parity tests
npm run gen:spec               # re-vendor contracts/spec.json from the live API
npm run gen:types              # regenerate src/generated/ from the VENDORED spec (offline)
```

**Drift guard**: every operation in `contracts/spec.json` must map to a CLI command in
`src/coverage.ts` (or carry an explicit waiver with a reason). A daily scheduled workflow
(`.github/workflows/drift.yml`) compares the live spec against the vendored one and goes red
when the API moves; `tests/parity.test.ts` then walks you through the reconciliation
(coverage, docs mention-parity, version pin, generated-types freshness).

Design charter: [DESIGN.md](./DESIGN.md) — the output contract, exit-code dictionary, and the
agent-ergonomics axioms this tool is built to.
