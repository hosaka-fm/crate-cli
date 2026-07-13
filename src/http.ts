/**
 * http.ts — the one request path. Maps every transport/API failure onto the exit-code
 * dictionary with a teaching message (the crate API's own error/message/hint/param fields are
 * passed through verbatim — the API already teaches; the CLI adds transport-level teaching).
 * No auto-retry anywhere: agents own their retry policy (429 surfaces Retry-After and exits 4).
 */
import { CliError, EXIT } from './errors.js';
import { KEY_HOWTO, resolveApiKey, resolveBaseUrl } from './config.js';

export interface HttpOpts {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  /** public endpoints (/api/v2, /api/v2/openapi.json) skip the key requirement */
  requireKey?: boolean;
}

export const CLI_VERSION = '0.3.2';

interface ApiErrorBody {
  error?: string;
  message?: string;
  hint?: string;
  param?: string;
  retry_after_seconds?: number;
}

export async function apiGet(path: string, params: Record<string, string | number | undefined>, opts: HttpOpts): Promise<unknown> {
  const base = resolveBaseUrl(opts.baseUrl);
  // A path may carry its own query string verbatim (the `crate api` escape hatch) — the URL
  // constructor preserves it byte-exact, including multi-valued params. `params` adds on top.
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { 'User-Agent': `crate-cli/${CLI_VERSION}` };
  if (opts.requireKey !== false) {
    const { key } = resolveApiKey(opts.apiKey);
    if (key === null) {
      throw new CliError('this command needs an API key (X-API-Key) and none is configured', EXIT.AUTH, KEY_HOWTO);
    }
    headers['X-API-Key'] = key;
  }

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeout ?? 30_000) });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new CliError(`could not reach ${url.host} (${cause})`, EXIT.NETWORK, [
      'check your connection; the API base is ' + base,
      'a non-default base? set CRATE_BASE_URL or --base-url',
      `raise the timeout: --timeout ${((opts.timeout ?? 30_000) * 2) / 1000}s worth of ms (e.g. --timeout 60000)`,
    ]);
  }

  if (res.ok) {
    return res.json();
  }

  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  const apiMsg = body.message ?? body.error ?? `HTTP ${res.status}`;
  const apiHints = body.hint !== undefined ? [body.hint] : [];

  if (res.status === 401 || res.status === 402 || res.status === 403) {
    throw new CliError(`the API rejected the key (${apiMsg})`, EXIT.AUTH, [
      ...apiHints,
      'check what the CLI is sending: crate auth status',
      ...KEY_HOWTO,
      'fresh key? key writes land on the primary but reads hit a replica — wait a few seconds and retry',
    ]);
  }
  if (res.status === 400) {
    const param = body.param !== undefined ? ` (param: ${body.param})` : '';
    throw new CliError(`the API rejected the input${param}: ${apiMsg}`, EXIT.INVALID_INPUT, apiHints);
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') ?? String(body.retry_after_seconds ?? '');
    const rl = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
      .map((h) => `${h}=${res.headers.get(h) ?? '?'}`)
      .join(' ');
    throw new CliError(`rate limited (429)`, EXIT.RATE_LIMITED, [
      retryAfter !== '' ? `Retry-After: ${retryAfter}s` : 'no Retry-After header supplied',
      rl,
      'the CLI never auto-retries — back off and re-run when the window resets',
    ]);
  }
  if (res.status >= 500) {
    throw new CliError(`the API errored (${res.status}): ${apiMsg}`, EXIT.SERVER, [
      'this is upstream, not your invocation — retry shortly',
      ...apiHints,
    ]);
  }
  throw new CliError(`unexpected HTTP ${res.status}: ${apiMsg}`, EXIT.SERVER, apiHints);
}
