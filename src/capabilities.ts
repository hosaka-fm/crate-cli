/**
 * capabilities.ts — the machine contract (Axiom 9). Everything an agent needs to drive the CLI
 * without an external doc lookup: version pins, command list, exit codes, env vars, output rules.
 * Deterministic: no timestamps, stable ordering. Schema-pinned by tests/cli-e2e.test.ts.
 *
 * The API-command list is DERIVED from src/coverage.ts (the parity map) — a command cannot
 * appear here without a COVERAGE entry, and tests/parity.test.ts fails a COVERAGE entry whose
 * command lacks a description below. One map, no second copy to forget.
 */
import { EXIT_DICTIONARY } from './errors.js';
import { API_VERSION_PIN, DEFAULT_BASE_URL } from './config.js';
import { COVERAGE } from './coverage.js';
import { CLI_VERSION } from './http.js';

/** one-line contract text per API-wrapping command, keyed by COVERAGE command name */
const API_COMMAND_DESCRIPTIONS: Record<string, string> = {
  resolve: 'name / pasted link / discogs / mbid → canonical cluster_id + locators (START HERE)',
  artist: 'full artist dossier by 64-hex cluster_id or slug; --fields trims',
  master: 'a master (release-group) dossier addressed under its artist: master <key> <id>',
  bandcamp: 'a Bandcamp release addressed under its artist: bandcamp <key> <item>',
  preview: 'KEYLESS education teaser — a capped artist slice (the full dossier needs a key)',
  label: 'label dossier by hex or slug',
  festival: 'festival dossier by canonical slug',
  search: 'faceted catalogue search (genre/style/country/year/label/format + --nl)',
  facets: 'valid facet names + values for refining search',
  artists: 'browse the artist grain — genre/style/tier filters, discovery-ranked',
  aura: 'multi-dimension convergence signals, strongest first; `aura <cluster>` for one artist',
  breakouts: 'emerging artists (booking momentum × press)',
  tastemakers: 'tastemaker leaderboard; --ones-to-watch for the rising slice',
  manifest: 'the dossier data dictionary — every field + provenance per grain',
};

/** commands with no API operation of their own (the parity map does not govern these) */
const LOCAL_COMMAND_DESCRIPTIONS: Record<string, string> = {
  api: 'raw authenticated GET against any /api/v2 path (escape hatch)',
  auth: 'set / status / unset the stored API key',
  capabilities: 'this machine contract (--json is implied when piped)',
  'robot-docs': 'the paste-ready agent handbook',
  triage: 'ONE call: auth state + live API health + quick_ref + copy-paste next commands',
  docs: 'where the human docs live',
};

const commands: Record<string, string> = Object.fromEntries([
  ...[...new Set(COVERAGE.map((c) => c.command))].map((name) => [
    name,
    API_COMMAND_DESCRIPTIONS[name] ?? 'MISSING DESCRIPTION — add to API_COMMAND_DESCRIPTIONS in capabilities.ts',
  ]),
  ...Object.entries(LOCAL_COMMAND_DESCRIPTIONS),
]);

export const CAPABILITIES = {
  name: 'crate',
  cli_version: CLI_VERSION,
  contract_version: 1,
  api: {
    base_url_default: DEFAULT_BASE_URL,
    version_pin: API_VERSION_PIN,
    spec: '/api/v2/openapi.json',
    auth_header: 'X-API-Key',
  },
  output: {
    stdout: 'data only — the untransformed API JSON body in json mode',
    stderr: 'all diagnostics, warnings, errors, hints',
    default_tty: 'human panels',
    default_non_tty: 'json (2-space indent, API key order preserved, byte-deterministic)',
    force_flags: ['--json', '--human'],
    color_suppressors: ['NO_COLOR', 'CI', 'TERM=dumb', '--no-color', 'non-TTY'],
  },
  semantics: {
    honest_gap: 'present:false bodies are ANSWERS — exit 0, data on stdout',
    degraded: "state:'degraded' bodies are honest read-failures upstream — exit 0, data on stdout",
    no_auto_retry: 'the CLI never retries; 429 exits 4 with Retry-After on stderr',
  },
  exit_codes: Object.fromEntries(Object.entries(EXIT_DICTIONARY).map(([k, v]) => [String(v.code), `${k} — ${v.meaning}`])),
  env: {
    CRATE_API_KEY: 'the API key (precedence: --api-key flag > this > config file)',
    CRATE_BASE_URL: `override the API base (default ${DEFAULT_BASE_URL})`,
    CRATE_VERBOSE: 'set to 1 to print stack traces on unexpected errors',
    NO_COLOR: 'suppress ANSI styling',
  },
  config_file: '~/.config/crate/config.json (XDG_CONFIG_HOME honored; 0600; written by `crate auth set`)',
  commands,
} as const;
