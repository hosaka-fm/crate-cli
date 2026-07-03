/**
 * output.ts — the output contract (DESIGN.md).
 * stdout = data only. TTY → human panels; non-TTY → the raw API JSON, byte-deterministic
 * (2-space indent, key order preserved from the API). --json / --human force either.
 * Color only when: TTY AND no NO_COLOR AND no CI AND TERM!=dumb AND no --no-color.
 */

export interface OutputOpts {
  json?: boolean;
  human?: boolean;
  noColor?: boolean;
}

export function wantJson(opts: OutputOpts): boolean {
  if (opts.json === true) return true;
  if (opts.human === true) return false;
  return !process.stdout.isTTY;
}

export function wantColor(opts: OutputOpts): boolean {
  if (opts.noColor === true) return false;
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false') return false;
  if (process.env.TERM === 'dumb') return false;
  return process.stdout.isTTY === true;
}

export function paint(opts: OutputOpts): {
  dim: (s: string) => string;
  bold: (s: string) => string;
  amber: (s: string) => string;
  cyan: (s: string) => string;
  red: (s: string) => string;
} {
  const on = wantColor(opts);
  const wrap = (open: string, close: string) => (s: string) => (on ? `\u001b[${open}m${s}\u001b[${close}m` : s);
  return {
    dim: wrap('2', '22'),
    bold: wrap('1', '22'),
    amber: wrap('33', '39'),
    cyan: wrap('36', '39'),
    red: wrap('31', '39'),
  };
}

/** The single data-emission path. `data` is the untransformed API body. */
export function emit(data: unknown, opts: OutputOpts, humanRender?: (d: unknown) => string): void {
  if (wantJson(opts)) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  process.stdout.write((humanRender ?? genericRender(opts))(data) + '\n');
}

/** Generic JSON→panel renderer: aligned k/v for objects, mini-tables for uniform object
 *  arrays, JSON fallback for anything deep. Bespoke renderers are YAGNI — humans who want
 *  more run --json | jq. */
export function genericRender(opts: OutputOpts): (d: unknown) => string {
  const c = paint(opts);
  const scalar = (v: unknown): string => {
    if (v === null) return c.dim('—');
    if (typeof v === 'boolean') return v ? c.cyan('yes') : c.dim('no');
    if (typeof v === 'number') return c.amber(String(v));
    return String(v);
  };
  const isScalar = (v: unknown): boolean => v === null || typeof v !== 'object';
  const render = (d: unknown, depth: number): string => {
    const pad = '  '.repeat(depth);
    if (isScalar(d)) return pad + scalar(d);
    if (Array.isArray(d)) {
      if (d.length === 0) return pad + c.dim('(empty)');
      if (d.every((x) => isScalar(x))) return pad + d.map(scalar).join(c.dim(' · '));
      return d.map((x, i) => pad + c.dim(`[${i}]`) + '\n' + render(x, depth + 1)).join('\n');
    }
    const entries = Object.entries(d as Record<string, unknown>);
    if (entries.length === 0) return pad + c.dim('(empty)');
    const width = Math.min(28, Math.max(...entries.map(([k]) => k.length)));
    return entries
      .map(([k, v]) => {
        const key = c.dim(k.padEnd(width));
        if (isScalar(v)) return `${pad}${key}  ${scalar(v)}`;
        return `${pad}${key}\n${render(v, depth + 1)}`;
      })
      .join('\n');
  };
  return (d: unknown) => render(d, 0);
}
