/**
 * errors.ts — the exit-code dictionary (DESIGN.md) + the one error type every command throws.
 * Every failure reaches the user via fail(): what failed + the exact fix, on stderr, non-zero exit.
 * Never silent-fail; never exit 1 for "no results" (that's exit 0 with an honest-gap body).
 */

export const EXIT = {
  OK: 0,
  USAGE: 1,
  AUTH: 2,
  INVALID_INPUT: 3,
  RATE_LIMITED: 4,
  SERVER: 5,
  NETWORK: 6,
  CONFIG: 7,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export const EXIT_DICTIONARY: Record<string, { code: ExitCode; meaning: string }> = {
  ok: { code: EXIT.OK, meaning: 'success — including honest-gap (present:false) and state:degraded bodies' },
  usage: { code: EXIT.USAGE, meaning: 'usage error — bad args/flags; the message names the corrected invocation' },
  auth: { code: EXIT.AUTH, meaning: 'auth error — missing/invalid API key (HTTP 401/402)' },
  invalid_input: { code: EXIT.INVALID_INPUT, meaning: 'the API rejected the input (HTTP 400); its hint is passed through' },
  rate_limited: { code: EXIT.RATE_LIMITED, meaning: 'HTTP 429 — Retry-After surfaced on stderr; the CLI never auto-retries' },
  server: { code: EXIT.SERVER, meaning: 'upstream server error (HTTP 5xx)' },
  network: { code: EXIT.NETWORK, meaning: 'network failure (DNS, timeout, connection refused)' },
  config: { code: EXIT.CONFIG, meaning: 'config file unreadable or corrupt' },
};

export class CliError extends Error {
  readonly code: ExitCode;
  readonly hints: string[];

  constructor(message: string, code: ExitCode, hints: string[] = []) {
    super(message);
    this.code = code;
    this.hints = hints;
  }
}

/** Print the error contract to stderr and exit. The ONLY exit path for failures. */
export function fail(err: unknown): never {
  if (err instanceof CliError) {
    process.stderr.write(`crate: ${err.message}\n`);
    for (const hint of err.hints) process.stderr.write(`  hint: ${hint}\n`);
    process.exit(err.code);
  }
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`crate: unexpected error: ${msg}\n`);
  process.stderr.write(`  hint: re-run with --verbose for the stack; report at https://github.com/hosaka-fm/crate-cli/issues\n`);
  if (process.env.CRATE_VERBOSE === '1' && err instanceof Error && err.stack) {
    process.stderr.write(err.stack + '\n');
  }
  process.exit(EXIT.SERVER);
}
