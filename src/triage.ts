/**
 * triage.ts — the TRIAGE mega-command (Axiom 10): ONE call answering "can I work, and what
 * do I run next?". Auth state + live API reachability/version + quick_ref + copy-paste
 * next commands. Degrades gracefully: every probe failure is reported, never thrown.
 */
import { API_VERSION_PIN, maskKey, resolveApiKey, resolveBaseUrl } from './config.js';
import { CLI_VERSION, apiGet, type HttpOpts } from './http.js';
import { CliError } from './errors.js';

export async function buildTriage(opts: HttpOpts): Promise<Record<string, unknown>> {
  const base = resolveBaseUrl(opts.baseUrl);
  const { key, source } = resolveApiKey(opts.apiKey);

  // Probe 1 — public root (no key): reachability + served spec version.
  let apiProbe: Record<string, unknown>;
  try {
    const root = (await apiGet('/api/v2', {}, { ...opts, requireKey: false })) as { version?: string };
    apiProbe = { reachable: true, base_url: base, served_major: root.version ?? 'unknown', cli_built_against: API_VERSION_PIN };
  } catch (err) {
    apiProbe = {
      reachable: false,
      base_url: base,
      error: err instanceof CliError ? err.message : String(err),
    };
  }

  // Probe 2 — keyed check (cheap precomputed endpoint) only when a key is configured.
  let authProbe: Record<string, unknown>;
  if (key === null) {
    authProbe = { configured: false, fix: 'export CRATE_API_KEY=… or `crate auth set` — see `crate robot-docs`' };
  } else {
    try {
      await apiGet('/api/v2/facets', {}, opts);
      authProbe = { configured: true, source, key_masked: maskKey(key), key_works: true };
    } catch (err) {
      authProbe = {
        configured: true,
        source,
        key_masked: maskKey(key),
        key_works: false,
        error: err instanceof CliError ? err.message : String(err),
        hints: err instanceof CliError ? err.hints : [],
      };
    }
  }

  const ok = apiProbe.reachable === true && (key === null ? false : authProbe.key_works === true);
  return {
    ok,
    cli_version: CLI_VERSION,
    api: apiProbe,
    auth: authProbe,
    quick_ref: {
      start_here: 'crate resolve "<artist name or pasted link>"',
      then: 'crate artist <cluster_id>',
      discover: ['crate aura', 'crate breakouts', 'crate tastemakers', 'crate search "<q>"'],
      contract: 'crate capabilities',
      handbook: 'crate robot-docs',
    },
    next_commands: ok
      ? ['crate resolve "Four Tet"', 'crate aura --limit 5', 'crate search "detroit techno" --limit 5']
      : key === null
        ? ['crate auth set', 'crate triage']
        : ['crate auth status', 'crate triage'],
  };
}
