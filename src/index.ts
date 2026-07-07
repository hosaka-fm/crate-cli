#!/usr/bin/env node
/**
 * crate — the command-line door to the crate music-data API. Agents-first (see DESIGN.md):
 * deterministic JSON on pipes, exit-code dictionary, teaching errors, in-tool agent docs.
 */
import { createInterface } from 'node:readline';
import { Command } from 'commander';

import { CAPABILITIES } from './capabilities.js';
import { API_VERSION_PIN, configPath, deleteConfigKey, maskKey, readConfig, resolveApiKey, resolveBaseUrl, writeConfig } from './config.js';
import { CliError, EXIT, fail } from './errors.js';
import { CLI_VERSION, apiGet, type HttpOpts } from './http.js';
import { emit, paint, type OutputOpts } from './output.js';
import { ROBOT_DOCS } from './robot-docs.js';
import { buildTriage } from './triage.js';

const HEX64 = /^[0-9a-fA-F]{64}$/;

const program = new Command('crate');

program
  .description(
    `the command-line door to the crate music-data API (cluster-first, v2)\n\n` +
      `start here:  crate resolve "<artist name or link>"   then:  crate artist <cluster_id>\n` +
      `agents:      crate robot-docs   ·   crate capabilities   ·   crate triage\n` +
      `piped output is the raw API JSON (deterministic); on a TTY you get human panels.`
  )
  .version(CLI_VERSION, '-v, --version', 'print the CLI version')
  .option('--json', 'force JSON output (the raw API body)')
  .option('--human', 'force human-readable output')
  .option('--no-color', 'disable ANSI styling (also honors NO_COLOR, CI, TERM=dumb)')
  .option('--api-key <key>', 'API key for this invocation (prefer CRATE_API_KEY or `crate auth set`)')
  .option('--base-url <url>', 'API base URL (default https://crate.hosaka.fm; env CRATE_BASE_URL)')
  .option('--timeout <ms>', 'network timeout in milliseconds (default 30000)')
  .showSuggestionAfterError(true)
  .showHelpAfterError('(run `crate --help` for the full surface, or `crate robot-docs` for the agent handbook)');

function outOpts(): OutputOpts {
  const o = program.opts<{ json?: boolean; human?: boolean; color?: boolean }>();
  return { json: o.json, human: o.human, noColor: o.color === false };
}

function httpOpts(): HttpOpts {
  const o = program.opts<{ apiKey?: string; baseUrl?: string; timeout?: string }>();
  const timeout = o.timeout !== undefined ? Number(o.timeout) : undefined;
  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) {
    throw new CliError(`--timeout must be a positive number of milliseconds (got: ${o.timeout})`, EXIT.USAGE, [
      'example: crate --timeout 60000 search "burial"',
    ]);
  }
  return { apiKey: o.apiKey, baseUrl: o.baseUrl, timeout };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function run(fn: (...args: any[]) => Promise<void>): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err) {
      fail(err);
    }
  };
}

// ── identity ────────────────────────────────────────────────────────────────

program
  .command('resolve')
  .description('resolve a name, pasted link, or id → the canonical cluster_id + locators (START HERE)')
  .argument('[query...]', 'artist name or a pasted URL (bandcamp/soundcloud/spotify/…)')
  .option('--discogs <id>', 'resolve a discogs artist id')
  .option('--mbid <uuid>', 'resolve a MusicBrainz id')
  .option('--cluster <hex>', 'verify a 64-hex cluster_id')
  .action(
    run(async (queryParts: string[], o: { discogs?: string; mbid?: string; cluster?: string }) => {
      const query = queryParts.join(' ').trim();
      const params: Record<string, string | undefined> = {};
      if (o.discogs !== undefined) params.discogs = o.discogs;
      else if (o.mbid !== undefined) params.mbid = o.mbid;
      else if (o.cluster !== undefined) params.cluster = o.cluster;
      else if (query.startsWith('http://') || query.startsWith('https://')) params.url = query;
      else if (query !== '') params.q = query;
      else {
        throw new CliError('resolve needs something to resolve', EXIT.USAGE, [
          'a name:   crate resolve "Four Tet"',
          'a link:   crate resolve https://fourtet.bandcamp.com',
          'an id:    crate resolve --discogs 2544 · crate resolve --mbid <uuid> · crate resolve --cluster <64-hex>',
        ]);
      }
      emit(await apiGet('/api/v2/resolve', params, httpOpts()), outOpts());
    })
  );

program
  .command('artist')
  .description('the full artist dossier — key is a 64-hex cluster_id (canonical) or a slug')
  .argument('<key>', 'cluster_id hex or slug (have a name? run `crate resolve` first)')
  .option('--fields <list>', 'comma-separated top-level facets to KEEP (e.g. identity,discography)')
  .action(
    run(async (key: string, o: { fields?: string }) => {
      emit(await apiGet(`/api/v2/artist/${encodeURIComponent(key)}`, { fields: o.fields }, httpOpts()), outOpts());
    })
  );

program
  .command('master')
  .description('a master (release-group) dossier addressed under its artist')
  .argument('<key>', 'the artist — 64-hex cluster_id or slug')
  .argument('<id>', 'the discogs_master_id (list them: crate artist <key> --fields discography)')
  .action(
    run(async (key: string, id: string) => {
      emit(await apiGet(`/api/v2/artist/${encodeURIComponent(key)}/master/${encodeURIComponent(id)}`, {}, httpOpts()), outOpts());
    })
  );

program
  .command('bandcamp')
  .description('a Bandcamp release addressed under its artist (tracklist + artwork + economics)')
  .argument('<key>', 'the artist — 64-hex cluster_id or slug')
  .argument('<item>', 'the numeric bandcamp_item_id (list them: crate artist <key> --fields bandcamp_releases)')
  .action(
    run(async (key: string, item: string) => {
      emit(await apiGet(`/api/v2/artist/${encodeURIComponent(key)}/bandcamp/${encodeURIComponent(item)}`, {}, httpOpts()), outOpts());
    })
  );

program
  .command('label')
  .description('the full label dossier — key is a 64-hex label cluster_id or a slug')
  .argument('<key>')
  .action(run(async (key: string) => emit(await apiGet(`/api/v2/label/${encodeURIComponent(key)}`, {}, httpOpts()), outOpts())));

program
  .command('festival')
  .description('the festival dossier — history, editions, who played when')
  .argument('<slug>', 'the canonical festival key (e.g. dekmantel)')
  .action(run(async (slug: string) => emit(await apiGet(`/api/v2/dossier/festival/${encodeURIComponent(slug)}`, {}, httpOpts()), outOpts())));

program
  .command('preview')
  .description('KEYLESS education teaser — a capped slice of the artist dossier (the real thing: crate artist)')
  .argument('<query...>', 'artist name, slug, or 64-hex cluster_id')
  .action(
    run(async (queryParts: string[]) => {
      emit(await apiGet('/api/v2/preview/artist', { q: queryParts.join(' ').trim() }, { ...httpOpts(), requireKey: false }), outOpts());
    })
  );

// ── discovery ───────────────────────────────────────────────────────────────

program
  .command('search')
  .description('faceted search across the catalogue; read .facets in the response, then refine')
  .argument('[query...]')
  .option('--genre <g>')
  .option('--style <s>')
  .option('--country <c>')
  .option('--label <l>')
  .option('--format <f>')
  .option('--year-from <y>')
  .option('--year-to <y>')
  .option('--limit <n>')
  .option('--offset <n>')
  .option('--nl', 'natural-language interpretation of the query')
  .action(
    run(
      async (
        queryParts: string[],
        o: {
          genre?: string; style?: string; country?: string; label?: string; format?: string;
          yearFrom?: string; yearTo?: string; limit?: string; offset?: string; nl?: boolean;
        }
      ) => {
        const q = queryParts.join(' ').trim();
        emit(
          await apiGet(
            '/api/v2/search',
            {
              q: q === '' ? undefined : q,
              genre: o.genre, style: o.style, country: o.country, label: o.label, format: o.format,
              year_from: o.yearFrom, year_to: o.yearTo, limit: o.limit, offset: o.offset,
              nl: o.nl === true ? 'true' : undefined,
            },
            httpOpts()
          ),
          outOpts()
        );
      }
    )
  );

program
  .command('facets')
  .description('the valid facet names + values for refining search')
  .option('--genre <g>')
  .option('--style <s>')
  .option('--country <c>')
  .option('--year-from <y>')
  .option('--year-to <y>')
  .action(
    run(async (o: { genre?: string; style?: string; country?: string; yearFrom?: string; yearTo?: string }) => {
      emit(
        await apiGet('/api/v2/facets', { genre: o.genre, style: o.style, country: o.country, year_from: o.yearFrom, year_to: o.yearTo }, httpOpts()),
        outOpts()
      );
    })
  );

program
  .command('artists')
  .description('browse the artist grain — genre/style/tier filters, discovery-ranked')
  .option('--genre <g>', 'exact primary genre (vocabulary: crate facets)')
  .option('--style <s>', 'exact style')
  .option('--tier <t>', 'breakout | rising | steady')
  .option('--sort <s>', 'discovery (default) | reach')
  .option('--limit <n>', '1..100 (default 24)')
  .option('--offset <n>', 'pagination; offset+limit ≤ 500 (the server window)')
  .action(
    run(async (o: { genre?: string; style?: string; tier?: string; sort?: string; limit?: string; offset?: string }) => {
      emit(
        await apiGet('/api/v2/artists', { genre: o.genre, style: o.style, tier: o.tier, sort: o.sort, limit: o.limit, offset: o.offset }, httpOpts()),
        outOpts()
      );
    })
  );

program
  .command('aura')
  .description('multi-dimension convergence signals, strongest first; pass a cluster_id for one artist')
  .argument('[cluster]', '64-hex cluster_id (omit for the ranked list)')
  .option('--limit <n>', 'max rows, clamped 1..200 (default 50)')
  .action(
    run(async (cluster: string | undefined, o: { limit?: string }) => {
      if (cluster !== undefined) {
        if (!HEX64.test(cluster)) {
          throw new CliError(`'${cluster}' is not a 64-hex cluster_id`, EXIT.INVALID_INPUT, [
            `have a name or link? resolve it first: crate resolve "${cluster}"`,
            'then: crate aura <cluster_id>',
          ]);
        }
        emit(await apiGet(`/api/v2/aura/${cluster.toLowerCase()}`, {}, httpOpts()), outOpts());
        return;
      }
      emit(await apiGet('/api/v2/aura', { limit: o.limit }, httpOpts()), outOpts());
    })
  );

program
  .command('breakouts')
  .description('emerging artists (booking momentum cross-validated against press)')
  .option('--tier <t>', 'breakout | rising')
  .option('--corroboration <c>', 'corroborated | booking_ahead')
  .option('--limit <n>')
  .action(
    run(async (o: { tier?: string; corroboration?: string; limit?: string }) => {
      emit(await apiGet('/api/v2/breakouts', { tier: o.tier, corroboration: o.corroboration, limit: o.limit }, httpOpts()), outOpts());
    })
  );

program
  .command('tastemakers')
  .description('the tastemaker leaderboard; --ones-to-watch for the rising slice')
  .option('--ones-to-watch', 'the rising tastemakers slice only')
  .option('--limit <n>')
  .action(
    run(async (o: { onesToWatch?: boolean; limit?: string }) => {
      const path = o.onesToWatch === true ? '/api/v2/tastemakers/ones-to-watch' : '/api/v2/tastemakers';
      emit(await apiGet(path, { limit: o.limit }, httpOpts()), outOpts());
    })
  );

program
  .command('manifest')
  .description('the dossier data dictionary — every field crate can expose, with provenance')
  .action(run(async () => emit(await apiGet('/api/v2/dossier/manifest', {}, httpOpts()), outOpts())));

// ── escape hatch ────────────────────────────────────────────────────────────

program
  .command('api')
  .description('raw authenticated GET against any /api/v2 path (the escape hatch, like `gh api`)')
  .argument('<path>', 'e.g. /api/v2/aura?limit=3 (leading /api/v2 optional)')
  .action(
    run(async (path: string) => {
      let p = path.startsWith('/') ? path : `/${path}`;
      if (!p.startsWith('/api/')) p = `/api/v2${p}`;
      // the query string rides verbatim (multi-valued params preserved byte-exact)
      emit(await apiGet(p, {}, httpOpts()), outOpts());
    })
  );

// ── auth ────────────────────────────────────────────────────────────────────

const auth = program.command('auth').description('manage the stored API key (config file, 0600)');

auth
  .command('set')
  .description('store an API key (reads from stdin — never lands in shell history)')
  .argument('[key]', 'the key; omit to read from stdin (recommended)')
  .action(
    run(async (key?: string) => {
      let k = key;
      if (k === undefined) {
        if (process.stdin.isTTY) {
          process.stderr.write('paste the API key: ');
        }
        const rl = createInterface({ input: process.stdin });
        for await (const line of rl) {
          k = line.trim();
          break;
        }
        rl.close();
      }
      if (k === undefined || k === '') {
        throw new CliError('no key provided', EXIT.USAGE, ['pipe it in: echo "$KEY" | crate auth set', 'or: crate auth set ck_live_…']);
      }
      const cfg = readConfig();
      cfg.api_key = k;
      writeConfig(cfg);
      process.stderr.write(`stored ${maskKey(k)} in ${configPath()} (0600)\n`);
    })
  );

auth
  .command('status')
  .description('which key would be used, from where, and does it work (live check)')
  .action(
    run(async () => {
      const { key, source } = resolveApiKey(program.opts<{ apiKey?: string }>().apiKey);
      const base = resolveBaseUrl(program.opts<{ baseUrl?: string }>().baseUrl);
      const body: Record<string, unknown> = {
        configured: key !== null,
        source,
        key_masked: key !== null ? maskKey(key) : null,
        base_url: base,
        config_path: configPath(),
      };
      if (key !== null) {
        try {
          await apiGet('/api/v2/facets', {}, httpOpts());
          body.key_works = true;
        } catch (err) {
          body.key_works = false;
          body.error = err instanceof CliError ? err.message : String(err);
        }
      } else {
        body.fix = 'export CRATE_API_KEY=… · crate auth set · crate --api-key … <cmd>';
      }
      emit(body, outOpts());
    })
  );

auth
  .command('unset')
  .description('remove the stored key from the config file (env/flag keys are untouched)')
  .action(
    run(async () => {
      const removed = deleteConfigKey();
      process.stderr.write(removed ? `removed the stored key from ${configPath()}\n` : `no stored key at ${configPath()} — nothing to remove\n`);
    })
  );

// ── agent surfaces ──────────────────────────────────────────────────────────

program
  .command('capabilities')
  .description('the machine contract: versions, commands, exit codes, env vars, output rules')
  .action(run(async () => emit(CAPABILITIES, outOpts())));

program
  .command('robot-docs')
  .description('the paste-ready agent handbook (markdown on stdout; --json wraps it as {guide})')
  .action(
    run(async () => {
      // the markdown IS the data; --json force-wraps it so the output contract holds everywhere
      if (outOpts().json === true) emit({ guide: ROBOT_DOCS }, { json: true });
      else process.stdout.write(ROBOT_DOCS);
    })
  );

program
  .command('triage')
  .description('ONE call: auth state + live API health + quick_ref + copy-paste next commands')
  .action(run(async () => emit(await buildTriage(httpOpts()), outOpts())));

program
  .command('docs')
  .description('where the human documentation lives')
  .action(
    run(async () => {
      emit(
        {
          docs: 'https://crate-sdk.hosaka.fm',
          api_spec: `${resolveBaseUrl(program.opts<{ baseUrl?: string }>().baseUrl)}/api/v2/openapi.json (pinned ${API_VERSION_PIN})`,
          product: 'https://crate.hosaka.fm',
          agent_handbook: 'crate robot-docs',
        },
        outOpts()
      );
    })
  );

// Discovery footer (agents) on every subcommand's --help — the contract is one hop away.
for (const c of program.commands) {
  c.addHelpText('after', '\nagents: `crate capabilities` is the machine contract (envelope + exit codes) · `crate robot-docs` is the handbook');
}

// ── no-args → concise help (clig.dev), unknown → suggestion ────────────────

if (process.argv.length <= 2) {
  const c = paint({ noColor: false });
  process.stdout.write(
    `${c.bold('crate')} — the command-line door to the crate music-data API\n\n` +
      `  ${c.cyan('crate resolve "Four Tet"')}        name/link → the canonical cluster_id (start here)\n` +
      `  ${c.cyan('crate artist <cluster_id>')}       the full dossier, one call\n` +
      `  ${c.cyan('crate aura')}                      convergence signals, strongest first\n` +
      `  ${c.cyan('crate triage')}                    am I set up? ONE call: auth + health + next steps\n\n` +
      `agents: ${c.amber('crate robot-docs')} is the handbook · ${c.amber('crate capabilities')} is the contract\n` +
      `run ${c.bold('crate --help')} for the full surface\n`
  );
  process.exit(EXIT.OK);
}

program.parseAsync(process.argv).catch(fail);
