/**
 * config.ts — key + base-URL resolution.
 * Precedence (clig.dev): --api-key flag > CRATE_API_KEY env > ~/.config/crate/config.json (0600).
 * The config file is the only place `crate auth set` writes; it never holds anything but
 * { api_key, base_url } so it stays greppable and hand-editable.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { CliError, EXIT } from './errors.js';

export const DEFAULT_BASE_URL = 'https://crate.hosaka.fm';
export const API_VERSION_PIN = '2.12.0';
export const KEY_HOWTO = [
  'set it for this shell:      export CRATE_API_KEY=ck_live_…',
  'or store it:                crate auth set   (reads the key from stdin — safe for shell history)',
  'or pass it once:            crate --api-key ck_live_… <command>',
  'no key yet? see https://crate.hosaka.fm (self-serve) or the docs at https://crate-sdk.hosaka.fm',
];

export interface CrateConfig {
  api_key?: string;
  base_url?: string;
}

export function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'crate', 'config.json');
}

export function readConfig(): CrateConfig {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as CrateConfig;
  } catch {
    throw new CliError(`config file at ${p} is not valid JSON`, EXIT.CONFIG, [
      `fix it by hand, or delete the file at ${p} and re-run: crate auth set`,
    ]);
  }
}

export function writeConfig(cfg: CrateConfig): void {
  const p = configPath();
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

export function deleteConfigKey(): boolean {
  const cfg = readConfig();
  if (cfg.api_key === undefined) return false;
  delete cfg.api_key;
  if (Object.keys(cfg).length === 0) {
    try { unlinkSync(configPath()); } catch { /* already gone */ }
  } else {
    writeConfig(cfg);
  }
  return true;
}

export type KeySource = 'flag' | 'env' | 'config' | null;

export function resolveApiKey(flagKey?: string): { key: string | null; source: KeySource } {
  if (flagKey !== undefined && flagKey.trim() !== '') return { key: flagKey.trim(), source: 'flag' };
  const env = process.env.CRATE_API_KEY;
  if (env !== undefined && env.trim() !== '') return { key: env.trim(), source: 'env' };
  const cfg = readConfig();
  if (cfg.api_key !== undefined && cfg.api_key.trim() !== '') return { key: cfg.api_key.trim(), source: 'config' };
  return { key: null, source: null };
}

export function resolveBaseUrl(flagUrl?: string): string {
  const candidate = flagUrl ?? process.env.CRATE_BASE_URL ?? readConfig().base_url ?? DEFAULT_BASE_URL;
  return candidate.replace(/\/+$/, '');
}

export function maskKey(key: string): string {
  if (key.length <= 12) return key.slice(0, 4) + '…';
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}
