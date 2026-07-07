/**
 * coverage.ts — single source of truth for API-operation ↔ CLI-command parity.
 * Every path in contracts/spec.json must appear in exactly one of COVERAGE or WAIVERS.
 * The drift-guard test (tests/parity.test.ts) enforces this at CI time.
 */

export interface CoverageEntry {
  method: string;
  path: string;
  command: string;
}

export interface WaiverEntry {
  method: string;
  path: string;
  reason: string;
}

/** Every API operation that a dedicated CLI command wraps. */
export const COVERAGE: CoverageEntry[] = [
  { method: 'GET', path: '/api/v2/resolve', command: 'resolve' },
  { method: 'GET', path: '/api/v2/artist/{key}', command: 'artist' },
  { method: 'GET', path: '/api/v2/label/{key}', command: 'label' },
  { method: 'GET', path: '/api/v2/dossier/festival/{slug}', command: 'festival' },
  { method: 'GET', path: '/api/v2/search', command: 'search' },
  { method: 'GET', path: '/api/v2/facets', command: 'facets' },
  { method: 'GET', path: '/api/v2/aura', command: 'aura' },
  { method: 'GET', path: '/api/v2/aura/{cluster}', command: 'aura' },
  { method: 'GET', path: '/api/v2/breakouts', command: 'breakouts' },
  { method: 'GET', path: '/api/v2/tastemakers', command: 'tastemakers' },
  { method: 'GET', path: '/api/v2/tastemakers/ones-to-watch', command: 'tastemakers' },
  { method: 'GET', path: '/api/v2/dossier/manifest', command: 'manifest' },
  { method: 'GET', path: '/api/v2/artists', command: 'artists' },
  { method: 'GET', path: '/api/v2/artist/{key}/master/{id}', command: 'master' },
  { method: 'GET', path: '/api/v2/artist/{key}/bandcamp/{item}', command: 'bandcamp' },
  { method: 'GET', path: '/api/v2/preview/artist', command: 'preview' },
];

/** Operations intentionally not wrapped by a dedicated command, with reasons. */
export const WAIVERS: WaiverEntry[] = [
  {
    method: 'GET',
    path: '/api/v2',
    reason: 'root index — consumed by triage; reachable via crate api /api/v2',
  },
  {
    method: 'GET',
    path: '/api/v2/openapi.json',
    reason: 'spec document — the gen:spec/gen:types source, not a data surface',
  },
  {
    method: 'GET',
    path: '/api/v2/dossier/artist/{slug}',
    reason: 'alias of /api/v2/artist/{key} — covered by the artist command',
  },
  {
    method: 'GET',
    path: '/api/v2/dossier/label/{slug}',
    reason: 'alias of /api/v2/label/{key} — covered by the label command',
  },
  {
    method: 'POST',
    path: '/api/v2/search-events/observed',
    reason: 'browser-client telemetry beacon, not an agent data surface',
  },
  {
    method: 'POST',
    path: '/api/v2/search-events/refined',
    reason: 'browser-client telemetry beacon, not an agent data surface',
  },
];
