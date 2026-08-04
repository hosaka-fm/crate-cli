# Changelog

All notable changes to `crate-cli` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> The CLI vendors crate's `/api/v2` OpenAPI spec (`contracts/spec.json`) and generates its types
> offline from it. `API_VERSION_PIN` tracks the spec's `info.version`; a spec bump that isn't
> reconciled goes red via `tests/parity.test.ts` + the daily `drift.yml` cron.

## [0.3.8] - 2026-08-04

### Changed

- Vendored spec reconciled `/api/v2` **2.34.0 → 2.47.0** (thirteen contract versions: track resolver,
  semantics dictionary JSON, registry rows 43+44, and the dossier's cluster-native facet season incl.
  `journalism.signals.citedMentions[]`). New paths waived pending the `crate tracks` ergonomics
  follow-up (all reachable via `crate api`).

## [0.3.7] - 2026-07-26

### Changed

- Reconciled the vendored spec to `/api/v2` **2.34.0** — a catch-up across sixteen spec minors
  (2.18.0 → 2.34.0). The generated types (`src/generated/crate-api.ts`) now cover **`GET /api/v2/tracks`**
  (`?fuzzy`, `?source=mb|bandcamp|all` — the new Bandcamp track corpus — + a `sources[]` provenance
  array), resolve **`?isrc`** / **`?artist&track`** / name-mint fallback, **`GET /api/v2/semantics/dictionary`**,
  the artist-dossier facets **authorship / lineage / facts+visibility / debut / marketplace**, the aura
  **`about`** block, and surface registry **35 → 42** (tranches 7–10). `API_VERSION_PIN` → `2.34.0`.
- The generic `crate api <path>` / `crate artist` / `crate surface` pass-throughs already reached every
  live endpoint; this brings the vendored spec, types, and capabilities manifest into sync. (First-class
  `crate tracks` + resolve `--isrc/--artist/--track` flags remain an optional ergonomics follow-up.)

## [0.3.6] - 2026-07-14

### Changed

- Reconciled the vendored spec to `/api/v2` **2.18.0** — registry tranche-6 (+sync.placement_claim_by_cluster_v1, claim-grain placement drill-in; first sync surface; 35 surfaces). Operation set unchanged.

## [0.3.5] - 2026-07-14

### Changed

- Reconciled the vendored spec to `/api/v2` **2.17.0** — the artist `rights` facet gains a cluster-anchored `ledger` rights-registration dimension (registeredWorks / worksWithRegisteredIswc / distinctCowriters / cowritersWithMbid + a SoundCloud leg; counts only). Additive on `ArtistDossierContract.rights`; operation set unchanged.

## [0.3.4] - 2026-07-13

### Changed

- Reconciled the vendored spec to `/api/v2` **2.16.0** — registry tranche-5 (+mirror.cluster_authority_ids_v1, the authority-ID crosswalk; 34 surfaces). Operation set unchanged.

## [0.3.3] - 2026-07-13

### Changed

- Reconciled the vendored spec to `/api/v2` **2.15.0** — registry tranche-4 (+spine_artist_name_published_view, +artist_signal_known_since; 33 surfaces). Operation set unchanged.

## [0.3.2] - 2026-07-13

### Changed

- Reconciled the vendored spec to `/api/v2` **2.14.0** — registry tranche-3
  (`archive_api_v1.artist_mention_daily`; 31 surfaces). Operation set unchanged; `crate surface`
  already serves it.

## [0.3.1] - 2026-07-13

### Changed

- Reconciled the vendored spec to `/api/v2` **2.13.0** — registry tranche-2 (+24 seen surfaces,
  30 total). Operation set unchanged.

## [0.3.0] - 2026-07-12

### Added

- **`crate surface [name]`** — the surface-registry index (`GET /api/v2/surface`) and generic
  cluster-keyed reads (`GET /api/v2/surface/{name}`), keyset-paginated.

### Changed

- Repinned the vendored spec to `/api/v2` **2.12.0** (registry go-live).

## [0.2.2] - 2026-07-07

### Changed

- Pinned `/api/v2` **2.9.0 → 2.11.0** + regenerated types (scarcity + credits + placements facets;
  no new operations).

## [0.2.1] - 2026-07-07

### Changed

- Pinned `/api/v2` **2.8.0 → 2.9.0** + regenerated types (typed `related[]` with `clusterId`,
  geography facet, `master/{id}` path-pattern repair).

## [0.2.0] - 2026-07-07

### Added

- **Mechanized drift guard**: `tests/parity.test.ts` (every spec operation is covered by a command
  or waived with a reason) + the daily `drift.yml` cron diffing the live spec against the vendored
  pin.
- Commands reaching **API 2.8.0 parity**: `artists`, `master`, `bandcamp`, `preview`.

## [0.1.0] - 2026-07-03

### Added

- First release — an **agents-first CLI** for the crate API: raw-JSON stdout on pipe, teaching
  errors, a 0–7 exit dictionary, and the `capabilities` / `robot-docs` / `triage` agent surfaces.
