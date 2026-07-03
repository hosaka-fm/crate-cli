# crate-cli — design charter

`crate` — the command-line door to the crate API (crate.hosaka.fm/api/v2, spec pinned **2.1.0**).
**Primary user: AI agents.** Humans get a polished TTY rendering; agents get deterministic JSON,
a documented exit-code dictionary, teaching errors, and in-tool docs. Grounded in
[clig.dev](https://clig.dev/) and the agent-ergonomics kernel (19 axioms); the design targets the
Polish Bar from day one rather than retrofitting it.

## The One Rule (inherited)

The first command an agent instinctively tries must work — or redirect with a hint naming the
exact corrected invocation. `crate artist "Four Tet" | jq .` works on first try.

## Output contract (Axioms 4, 8, 12, 13)

| Context | Default |
|---|---|
| stdout is a TTY | human panels (color, aligned k/v) |
| stdout is NOT a TTY (pipe/agent) | **raw JSON — the exact API envelope, byte-deterministic** |
| `--json` | force JSON anywhere |
| `--human` | force human rendering anywhere |
| `NO_COLOR` / `CI` / `TERM=dumb` / `--no-color` / non-TTY | no ANSI, ever |

- stdout is DATA ONLY. Every diagnostic, progress note, warning and error goes to stderr.
- JSON output is the untransformed API response body (plus nothing) — schema drift is the API's
  versioned contract (info.version), not the CLI's. The CLI adds no timestamps, no wrappers.
- `state: degraded` / `present: false` (honest-gap) are ANSWERS: exit 0, data on stdout.

## Exit-code dictionary (Axiom 5)

| Code | Meaning |
|---|---|
| 0 | success — including honest-gap (`present:false`) and `state:degraded` responses |
| 1 | usage error (bad args/flags — the error names the corrected invocation) |
| 2 | auth error (missing/invalid key, 401/402 — the error says how to get + set a key) |
| 3 | invalid input rejected by the API (400 `invalid_locator` etc. — hint passed through) |
| 4 | rate limited (429 — Retry-After + X-RateLimit-* surfaced on stderr; NO auto-retry: the agent decides) |
| 5 | upstream server error (5xx) |
| 6 | network failure (DNS/timeout/conn-refused) |
| 7 | config error (unreadable/corrupt config file) |

Never exit 1 for "no results" — that is exit 0 with an empty/honest-gap body.

## Auth (clig.dev precedence, agent-pragmatic)

`--api-key` flag > `CRATE_API_KEY` env > `~/.config/crate/config.json` (0600, XDG-honoring).
`crate auth set` (reads the key from stdin or prompt — never a flag in shell history unless
explicitly given), `auth status` (masked key + live tier check), `auth unset`.
Keyless invocation of a keyed command → exit 2 with the exact three ways to provide a key.

## Command surface (v2, cluster-first — mirrors the API's own front-door recipe)

resolve · artist · label · festival · search · facets · aura · breakouts · tastemakers ·
manifest · api (raw authenticated escape hatch, like `gh api`) · auth · capabilities ·
robot-docs · triage (mega-command) · docs

## Agent surfaces (Axioms 9, 10)

- `crate capabilities` → machine contract: cli version, pinned api version, base URL, command
  list, exit-code dictionary, env-var dictionary, output-mode rules.
- `crate robot-docs` → the paste-ready agent handbook (no external doc lookup needed).
- `crate triage` → ONE call returning auth state + live API health + quick_ref + copy-paste
  next commands (the TRIAGE mega-command shape).

## Error pedagogy (Axiom 6) + intent inference (Axiom 7)

The crate API already ships teaching errors (`error`, `message`, `hint`, `param`); the CLI passes
them through verbatim and adds transport-level teaching (auth/network/rate-limit). Unknown
subcommands/flags get did-you-mean suggestions (Levenshtein), never a bare "unknown option".

## Deliberate omissions (YAGNI, filed not built)

- No beacons (`search-events/*`) — client telemetry, not an agent surface.
- No auto-retry/backoff — determinism first; agents own their retry policy.
- No pager, no interactive TUI (Axiom 15). No shell completions in v0.1 (queued).
- No single-binary compile (bun/pkg) in v0.1 — npm/npx is where agents already are (queued).
