/**
 * parity.test.ts — the drift guard (offline; gates CI). contracts/spec.json is the vendored
 * truth of the live API; every operation must be COVERED by a dedicated command or WAIVED with
 * a reason (src/coverage.ts). When the live API moves, .github/workflows/drift.yml goes red;
 * the fix path is `npm run gen:spec && npm run gen:types`, then reconcile src/coverage.ts —
 * and this file enforces everything downstream of that reconciliation (docs mention-parity,
 * version pin, capabilities derivation, generated-types freshness).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { CAPABILITIES } from '../src/capabilities.js';
import { API_VERSION_PIN } from '../src/config.js';
import { COVERAGE, WAIVERS } from '../src/coverage.js';
import { ROBOT_DOCS } from '../src/robot-docs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = join(ROOT, 'contracts', 'spec.json');
const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as {
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
};

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const specOps = Object.entries(spec.paths).flatMap(([p, ops]) =>
  Object.keys(ops)
    .filter((m) => HTTP_METHODS.has(m))
    .map((m) => `${m.toUpperCase()} ${p}`)
);
const opKey = (e: { method: string; path: string }): string => `${e.method.toUpperCase()} ${e.path}`;
const covered = new Set(COVERAGE.map(opKey));
const waived = new Set(WAIVERS.map(opKey));

describe('API ↔ CLI coverage (every operation accounted for)', () => {
  it('every spec operation is covered by a command or waived with a reason', () => {
    const orphans = specOps.filter((op) => !covered.has(op) && !waived.has(op));
    expect(
      orphans,
      `uncovered API operations: [${orphans.join(', ')}] — add a command + COVERAGE entry in src/coverage.ts, ` +
        `or a WAIVER with a reason; then mention the command in robot-docs.ts and README.md (mention-parity is tested below)`
    ).toEqual([]);
  });
  it('no operation is both covered and waived', () => {
    expect([...covered].filter((op) => waived.has(op))).toEqual([]);
  });
  it('no zombie COVERAGE/WAIVER entries (operations the spec no longer serves)', () => {
    const specSet = new Set(specOps);
    const zombies = [...covered, ...waived].filter((op) => !specSet.has(op));
    expect(
      zombies,
      `entries in src/coverage.ts not present in contracts/spec.json: [${zombies.join(', ')}] — ` +
        `the API dropped them; remove the entries (and the dedicated command, if any)`
    ).toEqual([]);
  });
  it('every waiver carries a real reason', () => {
    for (const w of WAIVERS) expect(w.reason.length, opKey(w)).toBeGreaterThan(10);
  });
});

describe('version-pin integrity', () => {
  it('API_VERSION_PIN matches the vendored spec info.version', () => {
    expect(API_VERSION_PIN).toBe(spec.info.version);
  });
  it('README quotes the real pin (no silent doc drift)', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    expect(readme, 'README must state the pinned spec version — update the Keys & docs section').toContain(`\`${API_VERSION_PIN}\``);
  });
  it('package.json version matches CLI_VERSION', async () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    const { CLI_VERSION } = await import('../src/http.js');
    expect(pkg.version).toBe(CLI_VERSION);
  });
  it('CHANGELOG.md has an entry for the current version (changelog drift guard)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    expect(
      changelog.includes(`## [${pkg.version}]`),
      `CHANGELOG.md is missing a "## [${pkg.version}]" entry — add one before shipping ${pkg.version}`,
    ).toBe(true);
  });
});

describe('generated-types freshness (the crate-sdk drift idiom)', () => {
  it(
    'src/generated/crate-api.ts is byte-identical to a fresh regen from contracts/spec.json',
    () => {
      const out = join(mkdtempSync(join(tmpdir(), 'crate-cli-parity-')), 'regen.ts');
      execFileSync(join(ROOT, 'node_modules', '.bin', 'openapi-typescript'), [SPEC_PATH, '-o', out], { stdio: 'pipe' });
      const fresh = readFileSync(out, 'utf8');
      const committed = readFileSync(join(ROOT, 'src', 'generated', 'crate-api.ts'), 'utf8');
      expect(committed === fresh, 'stale generated types — run `npm run gen:types` (did the spec change without a regen?)').toBe(true);
    },
    60_000
  );
});

describe('mention parity (the docs keep up with the surface)', () => {
  const commandNames = [...new Set(COVERAGE.map((c) => c.command))];
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  it.each(commandNames)('robot-docs mentions `crate %s`', (name) => {
    expect(ROBOT_DOCS).toContain(`crate ${name}`);
  });
  it.each(commandNames)('README mentions %s', (name) => {
    expect(new RegExp(`\\b${name}\\b`).test(readme), `README.md never mentions the ${name} command`).toBe(true);
  });
  it.each(commandNames)('capabilities.commands documents %s (derived from COVERAGE)', (name) => {
    const desc = (CAPABILITIES.commands as Record<string, string>)[name];
    expect(desc, `${name} is in COVERAGE but has no entry in API_COMMAND_DESCRIPTIONS (capabilities.ts)`).toBeTruthy();
    expect(desc).not.toContain('MISSING DESCRIPTION');
  });
});
