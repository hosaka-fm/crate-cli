/**
 * Unit tests: exit-code dictionary, output-mode logic, color suppression, config precedence,
 * HTTP error mapping (mocked fetch). The process-level contracts live in tests/cli-e2e.test.ts.
 */
import { mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXIT, EXIT_DICTIONARY, CliError } from '../src/errors.js';
import { wantJson, wantColor, genericRender } from '../src/output.js';
import { configPath, maskKey, readConfig, resolveApiKey, resolveBaseUrl, writeConfig } from '../src/config.js';
import { apiGet } from '../src/http.js';

const ENV_KEYS = ['CRATE_API_KEY', 'CRATE_BASE_URL', 'XDG_CONFIG_HOME', 'NO_COLOR', 'CI', 'TERM'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'crate-cli-test-'));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe('exit-code dictionary', () => {
  it('codes 0..7, unique, documented', () => {
    const codes = Object.values(EXIT_DICTIONARY).map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain(0);
    expect(Math.max(...codes)).toBe(7);
    for (const e of Object.values(EXIT_DICTIONARY)) expect(e.meaning.length).toBeGreaterThan(10);
  });
  it('never uses exit 1 for empty results (ok covers honest-gap by contract)', () => {
    expect(EXIT_DICTIONARY.ok!.meaning).toContain('honest-gap');
  });
});

describe('output mode', () => {
  it('--json forces json; --human forces human; non-TTY defaults json', () => {
    expect(wantJson({ json: true })).toBe(true);
    expect(wantJson({ human: true })).toBe(false);
    // vitest runs with stdout not a TTY → default is json
    expect(process.stdout.isTTY).toBeFalsy();
    expect(wantJson({})).toBe(true);
  });
  it('color suppressed by NO_COLOR / CI / TERM=dumb / non-TTY / --no-color', () => {
    expect(wantColor({})).toBe(false); // non-TTY here
    process.env.NO_COLOR = '1';
    expect(wantColor({})).toBe(false);
    delete process.env.NO_COLOR;
    process.env.CI = 'true';
    expect(wantColor({})).toBe(false);
    delete process.env.CI;
    expect(wantColor({ noColor: true })).toBe(false);
  });
  it('genericRender: aligned k/v, em-dash nulls, no ANSI when color off', () => {
    const out = genericRender({ noColor: true })({ artist_name: 'Objekt', break_odds: null, dims: ['radio', 'press'] });
    expect(out).toContain('artist_name');
    expect(out).toContain('Objekt');
    expect(out).toContain('—');
    expect(out).toContain('radio');
    expect(out).not.toMatch(/\u001b\[/);
  });
});

describe('config + key resolution (precedence: flag > env > config file)', () => {
  it('resolves in order and reports the source', () => {
    writeConfig({ api_key: 'ck_from_config' });
    expect(resolveApiKey(undefined)).toEqual({ key: 'ck_from_config', source: 'config' });
    process.env.CRATE_API_KEY = 'ck_from_env';
    expect(resolveApiKey(undefined)).toEqual({ key: 'ck_from_env', source: 'env' });
    expect(resolveApiKey('ck_from_flag')).toEqual({ key: 'ck_from_flag', source: 'flag' });
  });
  it('config file written 0600; corrupt file → CliError CONFIG with a fix hint', () => {
    writeConfig({ api_key: 'k' });
    const mode = statSync(configPath()).mode & 0o777;
    expect(mode).toBe(0o600);
    mkdirSync(join(process.env.XDG_CONFIG_HOME!, 'crate'), { recursive: true });
    writeFileSync(configPath(), '{not json');
    try {
      readConfig();
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(EXIT.CONFIG);
      expect((err as CliError).hints.join(' ')).toContain('rm ');
    }
  });
  it('maskKey never reveals the middle; base url strips trailing slash', () => {
    expect(maskKey('ck_live_abcdefghijklmnop')).toBe('ck_live_…mnop');
    expect(maskKey('ck_live_abcdefghijklmnop')).not.toContain('ijkl');
    process.env.CRATE_BASE_URL = 'https://example.test///';
    expect(resolveBaseUrl(undefined)).toBe('https://example.test');
  });
});

describe('http error mapping (mocked fetch)', () => {
  function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers }))
    );
  }

  it('keyless keyed call → AUTH before any network call', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(apiGet('/api/v2/aura', {}, {})).rejects.toMatchObject({ code: EXIT.AUTH });
    expect(spy).not.toHaveBeenCalled();
  });

  it('401 → AUTH, teaches all three key paths + replica-lag note', async () => {
    process.env.CRATE_API_KEY = 'ck_bad';
    stubFetch(401, { error: 'invalid_api_key', message: 'unknown key' });
    const err = await apiGet('/api/v2/aura', {}, {}).catch((e: CliError) => e);
    expect(err.code).toBe(EXIT.AUTH);
    const hints = err.hints.join('\n');
    expect(hints).toContain('CRATE_API_KEY');
    expect(hints).toContain('crate auth set');
    expect(hints).toContain('replica');
  });

  it('400 → INVALID_INPUT, passes the API hint + param through verbatim', async () => {
    process.env.CRATE_API_KEY = 'ck_ok';
    stubFetch(400, { error: 'invalid_locator', message: 'not a cluster', param: 'cluster', hint: 'GET /api/v2/resolve?q=…' });
    const err = await apiGet('/api/v2/aura/zzz', {}, {}).catch((e: CliError) => e);
    expect(err.code).toBe(EXIT.INVALID_INPUT);
    expect(err.message).toContain('param: cluster');
    expect(err.hints.join(' ')).toContain('/api/v2/resolve');
  });

  it('429 → RATE_LIMITED with Retry-After + X-RateLimit-* surfaced, no retry', async () => {
    process.env.CRATE_API_KEY = 'ck_ok';
    stubFetch(429, { error: 'rate_limited' }, { 'Retry-After': '30', 'X-RateLimit-Remaining': '0' });
    const err = await apiGet('/api/v2/search', { q: 'x' }, {}).catch((e: CliError) => e);
    expect(err.code).toBe(EXIT.RATE_LIMITED);
    const hints = err.hints.join('\n');
    expect(hints).toContain('Retry-After: 30');
    expect(hints).toContain('never auto-retries');
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it('5xx → SERVER; network failure → NETWORK with base-url hint', async () => {
    process.env.CRATE_API_KEY = 'ck_ok';
    stubFetch(503, { error: 'upstream' });
    await expect(apiGet('/api/v2/aura', {}, {})).rejects.toMatchObject({ code: EXIT.SERVER });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ENOTFOUND'))));
    const err = await apiGet('/api/v2/aura', {}, {}).catch((e: CliError) => e);
    expect(err.code).toBe(EXIT.NETWORK);
    expect(err.hints.join(' ')).toContain('CRATE_BASE_URL');
  });

  it('undefined/empty params are omitted; the key rides X-API-Key', async () => {
    process.env.CRATE_API_KEY = 'ck_ok';
    const spy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    await apiGet('/api/v2/search', { q: 'burial', genre: undefined, limit: '' }, {});
    const [url, init] = spy.mock.calls[0] as unknown as [URL, { headers: Record<string, string> }];
    expect(url.toString()).toContain('q=burial');
    expect(url.toString()).not.toContain('genre');
    expect(url.toString()).not.toContain('limit');
    expect(init.headers['X-API-Key']).toBe('ck_ok');
  });
});
