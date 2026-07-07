/**
 * Process-level contract tests — the Polish Bar as executable checks. Spawns the BUILT binary
 * (dist/index.js) hermetically: env scrubbed, XDG_CONFIG_HOME → temp, base URL → 127.0.0.1:1
 * (nothing ever reaches the real API). Pins: capabilities schema, robot-docs sections, help
 * discoverability, exit codes, stdout/stderr split, determinism, no-ANSI-when-piped.
 */
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '../dist/index.js');

interface Result {
  status: number;
  stdout: string;
  stderr: string;
}

function crate(args: string[], env: Record<string, string> = {}): Result {
  const opts: ExecFileSyncOptions = {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'crate-e2e-')),
      // hermetic: point at a dead loopback port so accidental network use fails fast
      CRATE_BASE_URL: 'http://127.0.0.1:1',
      ...env,
    },
    timeout: 20_000,
  };
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], opts) as unknown as string;
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return { status: e.status ?? -1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
  }
}

beforeAll(() => {
  if (!existsSync(BIN)) {
    throw new Error('dist/index.js missing — run `npm run build` first (the test suite pins the BUILT binary)');
  }
});

describe('capabilities (the machine contract)', () => {
  it('is valid JSON with the pinned schema keys', () => {
    const r = crate(['capabilities']);
    expect(r.status).toBe(0);
    const c = JSON.parse(r.stdout);
    // schema-pin: these keys are the contract; removing/renaming any is a breaking change
    expect(Object.keys(c).sort()).toEqual(
      ['api', 'cli_version', 'commands', 'config_file', 'contract_version', 'env', 'exit_codes', 'name', 'output', 'semantics'].sort()
    );
    expect(c.api.auth_header).toBe('X-API-Key');
    // FULL exit-code pin: all 8 codes present, spot meanings on each
    expect(Object.keys(c.exit_codes).map(Number).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(c.exit_codes['0']).toContain('honest-gap');
    expect(c.exit_codes['2']).toContain('auth');
    expect(c.exit_codes['3']).toContain('invalid');
    expect(c.exit_codes['4']).toContain('rate');
    // FULL command-surface pin: renaming/removing any command is a contract break
    expect(Object.keys(c.commands).sort()).toEqual(
      [
        'api', 'artist', 'artists', 'aura', 'auth', 'bandcamp', 'breakouts', 'capabilities', 'docs', 'facets',
        'festival', 'label', 'manifest', 'master', 'preview', 'resolve', 'robot-docs', 'search', 'tastemakers', 'triage',
      ].sort()
    );
  });
  it('is byte-deterministic across runs', () => {
    expect(crate(['capabilities']).stdout).toBe(crate(['capabilities']).stdout);
  });
});

describe('robot-docs (the agent handbook)', () => {
  it('covers quickstart, auth, output contract, exit codes, recipes — on stdout', () => {
    const r = crate(['robot-docs']);
    expect(r.status).toBe(0);
    for (const required of ['Quickstart', 'CRATE_API_KEY', 'Exit codes', 'honest gap', 'stderr', 'jq', 'Rate limits']) {
      expect(r.stdout).toContain(required);
    }
    expect(r.stderr).toBe('');
  });
});

describe('help + discoverability', () => {
  it('--help mentions the agent surfaces (robot-docs, capabilities, triage)', () => {
    const r = crate(['--help']);
    expect(r.status).toBe(0);
    for (const s of ['robot-docs', 'capabilities', 'triage', 'resolve']) expect(r.stdout).toContain(s);
  });
  it('bare `crate` (no args) → concise help, exit 0, never a TUI or a stack trace', () => {
    const r = crate([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('crate resolve');
    expect(r.stdout).toContain('--help');
  });
  it('unknown command → exit 1 + did-you-mean on stderr, stdout empty', () => {
    const r = crate(['serach']);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('search');
    expect(r.stderr.toLowerCase()).toContain('did you mean');
  });
  it('unknown flag → exit 1 + suggestion for the corrected flag', () => {
    const r = crate(['aura', '--limt', '5'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--limit');
  });
});

describe('exit-code contract (documented dictionary, deterministic)', () => {
  it('keyless keyed command → exit 2, teaches all three key paths, stdout empty', () => {
    const r = crate(['aura']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('CRATE_API_KEY');
    expect(r.stderr).toContain('crate auth set');
    expect(r.stderr).toContain('--api-key');
  });
  it('client-caught invalid input → exit 3 with the resolve redirect', () => {
    const r = crate(['aura', 'not-a-cluster'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('crate resolve');
  });
  it('network failure → exit 6 with base-url hint (hermetic dead port)', () => {
    const r = crate(['search', 'burial'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(6);
    expect(r.stderr).toContain('CRATE_BASE_URL');
  });
  it('usage error (bad --timeout) → exit 1 with a corrected example', () => {
    const r = crate(['--timeout', 'soon', 'aura'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--timeout 60000');
  });
});

describe('output discipline (Axioms 4, 12, 13)', () => {
  it('piped output carries no ANSI codes anywhere (capabilities + help + errors)', () => {
    for (const args of [['capabilities'], ['--help'], ['robot-docs']]) {
      const r = crate(args);
      expect(r.stdout).not.toMatch(/\u001b\[/);
      expect(r.stderr).not.toMatch(/\u001b\[/);
    }
    const err = crate(['aura', 'zzz'], { CRATE_API_KEY: 'ck_x' });
    expect(err.stderr).not.toMatch(/\u001b\[/);
  });
  it('every failure path writes stderr AND exits non-zero AND keeps stdout empty', () => {
    for (const [args, env] of [
      [['aura'], {}],
      [['aura', 'zzz'], { CRATE_API_KEY: 'k' }],
      [['nosuch'], {}],
      [['search', 'x'], { CRATE_API_KEY: 'k' }],
    ] as Array<[string[], Record<string, string>]>) {
      const r = crate(args, env);
      expect(r.status, args.join(' ')).toBeGreaterThan(0);
      expect(r.stderr.length, args.join(' ')).toBeGreaterThan(0);
      expect(r.stdout, args.join(' ')).toBe('');
    }
  });
});

describe('output force-flags at the process level', () => {
  it('robot-docs --json wraps the markdown as {guide}; bare robot-docs is markdown', () => {
    const j = crate(['robot-docs', '--json']);
    expect(j.status).toBe(0);
    expect(JSON.parse(j.stdout)).toHaveProperty('guide');
    const m = crate(['robot-docs']);
    expect(m.stdout.startsWith('# crate CLI')).toBe(true);
  });
  it('capabilities --human renders panels (not JSON); piped default stays JSON', () => {
    const h = crate(['capabilities', '--human']);
    expect(h.status).toBe(0);
    expect(h.stdout.trimStart().startsWith('{')).toBe(false);
    expect(h.stdout).toContain('cli_version');
    const j = crate(['capabilities']);
    expect(() => JSON.parse(j.stdout)).not.toThrow();
  });
});

describe('api escape hatch — path normalization (hermetic: accepted paths reach the network → exit 6)', () => {
  it.each([['aura?limit=3'], ['/aura'], ['/api/v2/aura'], ['/api/v2/aura?tier=a&tier=b']])('%s → normalized + attempted', (path) => {
    const r = crate(['api', path], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(6); // reached the (dead) network — the path was accepted verbatim
    expect(r.stdout).toBe('');
  });
});

describe('parity commands (API 2.8.0 catch-up) — hermetic dead-port contract', () => {
  it('artists with filters → attempts the network with a key (exit 6), stdout empty', () => {
    const r = crate(['artists', '--genre', 'Electronic', '--tier', 'breakout', '--limit', '5'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(6);
    expect(r.stdout).toBe('');
  });
  it('artists keyless → exit 2 (a keyed endpoint)', () => {
    expect(crate(['artists']).status).toBe(2);
  });
  it('master <key> <id> → attempts the network (exit 6)', () => {
    const r = crate(['master', 'four-tet', '12345'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(6);
    expect(r.stdout).toBe('');
  });
  it('master without the id → exit 1 usage, stdout empty', () => {
    const r = crate(['master', 'four-tet'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
  });
  it('bandcamp <key> <item> → attempts the network (exit 6)', () => {
    const r = crate(['bandcamp', 'a'.repeat(64), '123456'], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(6);
  });
  it('preview is KEYLESS: with NO key configured it attempts the network (exit 6, never exit 2)', () => {
    const r = crate(['preview', 'Four', 'Tet']);
    expect(r.status).toBe(6);
    expect(r.stdout).toBe('');
  });
  it('preview without args → exit 1 usage', () => {
    expect(crate(['preview']).status).toBe(1);
  });
});

describe('aura hex acceptance', () => {
  it('UPPERCASE 64-hex is accepted (lowercased) — reaches the network, not exit 3', () => {
    const r = crate(['aura', 'A'.repeat(64)], { CRATE_API_KEY: 'ck_x' });
    expect(r.status).toBe(6);
  });
});

describe('auth lifecycle (config file)', () => {
  it('set (stdin) → status shows masked key + source; unset removes it', () => {
    const home = mkdtempSync(join(tmpdir(), 'crate-auth-'));
    const env = { XDG_CONFIG_HOME: home, CRATE_BASE_URL: 'http://127.0.0.1:1' };
    const set = ((): Result => {
      try {
        const stdout = execFileSync(process.execPath, [BIN, 'auth', 'set'], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH ?? '', ...env },
          input: 'ck_test_abcdefghijk\n',
          timeout: 20_000,
        }) as unknown as string;
        return { status: 0, stdout, stderr: '' };
      } catch (err) {
        const e = err as { status?: number; stderr?: string };
        return { status: e.status ?? -1, stdout: '', stderr: String(e.stderr ?? '') };
      }
    })();
    expect(set.status).toBe(0);

    const status = ((): string => {
      try {
        return execFileSync(process.execPath, [BIN, 'auth', 'status'], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH ?? '', ...env },
          timeout: 20_000,
        }) as unknown as string;
      } catch (err) {
        return String((err as { stdout?: string }).stdout ?? '');
      }
    })();
    const parsed = JSON.parse(status);
    expect(parsed.configured).toBe(true);
    expect(parsed.source).toBe('config');
    expect(parsed.key_masked).not.toContain('abcdefghijk');
  });
});
