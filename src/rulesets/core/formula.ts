// Sheet formulas: a small Pratt parser (no eval). Numbers, + - * /, parentheses, floor/ceil/min/max/abs/mod,
// field references (@str_mod, @abilities.str) that may themselves be formulas, and dice (1d20, 2d20kh1, (@pb)d6).
// A formula with dice evaluates to a dice expression with every number worked out ("1d20 + @str_mod" -> "1d20+3"),
// ready for the dice model; one without dice evaluates to a number.

export class FormulaError extends Error {}

/** Looks a field up: a number, a formula string, or undefined when there is no such field. */
export type Resolver = (name: string) => number | string | undefined;

type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'neg'; e: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] }
  | { t: 'dice'; count: Node; sides: number | '%'; keep?: string };

type Tok = { k: 'num'; v: number } | { k: 'ref'; v: string } | { k: 'id'; v: string } | { k: 'dice'; sides: number | '%'; keep?: string; count?: number } | { k: 'op'; v: string } | { k: 'end' };

const FUNCS: Record<string, (a: number[]) => number> = {
  floor: (a) => Math.floor(one(a)),
  ceil: (a) => Math.ceil(one(a)),
  abs: (a) => Math.abs(one(a)),
  min: (a) => Math.min(...need(a, 1)),
  max: (a) => Math.max(...need(a, 1)),
  mod: (a) => {
    const [x, m] = need(a, 2);
    if (m === 0) throw new FormulaError('หารด้วยศูนย์ไม่ได้');
    return ((x % m) + m) % m;
  },
};
function one(a: number[]) {
  if (a.length !== 1) throw new FormulaError('ฟังก์ชันนี้รับค่าเดียว');
  return a[0];
}
function need(a: number[], n: number) {
  if (a.length < n) throw new FormulaError(`ฟังก์ชันนี้ต้องมีอย่างน้อย ${n} ค่า`);
  return a;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d*)d(\d+|%)((?:kh|kl|k)\d+)?(?![\w.])|(\d+(?:\.\d+)?)|@([A-Za-z_][\w.]*)|([A-Za-z_]\w*)|([-+*/(),]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s+$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new FormulaError(`อ่านสูตรไม่ออกตรง "${src.slice(i).trim()}"`);
    i = re.lastIndex;
    if (m[2] !== undefined) out.push({ k: 'dice', sides: m[2] === '%' ? '%' : +m[2], keep: m[3], ...(m[1] ? { count: +m[1] } : {}) });
    else if (m[4] !== undefined) out.push({ k: 'num', v: +m[4] });
    else if (m[5] !== undefined) out.push({ k: 'ref', v: m[5] });
    else if (m[6] !== undefined) out.push({ k: 'id', v: m[6] });
    else out.push({ k: 'op', v: m[7] });
  }
  out.push({ k: 'end' });
  return out;
}

const BP: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20 };

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek().k === 'op' && (peek() as { v: string }).v === v;

  function expr(rbp: number): Node {
    let left = prefix();
    for (;;) {
      const t = peek();
      // "(expr)d6": a parenthesised or function count directly followed by a die without its own count.
      if (t.k === 'dice' && t.count === undefined) {
        p++;
        left = { t: 'dice', count: left, sides: t.sides, keep: t.keep };
        continue;
      }
      if (t.k !== 'op' || !(t.v in BP) || BP[t.v] <= rbp) return left;
      p++;
      left = { t: 'bin', op: t.v as '+', a: left, b: expr(BP[t.v]) };
    }
  }

  function prefix(): Node {
    const t = toks[p++];
    switch (t.k) {
      case 'num':
        return { t: 'num', v: t.v };
      case 'ref':
        return { t: 'ref', name: t.v };
      case 'dice':
        return { t: 'dice', count: { t: 'num', v: t.count ?? 1 }, sides: t.sides, keep: t.keep };
      case 'id': {
        if (!(t.v in FUNCS)) throw new FormulaError(`ไม่มีฟังก์ชัน ${t.v} (ใช้ได้ ${Object.keys(FUNCS).join(' ')})`);
        if (!isOp('(')) throw new FormulaError(`หลัง ${t.v} ต้องมีวงเล็บ`);
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          for (;;) {
            args.push(expr(0));
            if (isOp(',')) p++;
            else break;
          }
        }
        if (!isOp(')')) throw new FormulaError('วงเล็บไม่ครบคู่');
        p++;
        return { t: 'call', fn: t.v, args };
      }
      case 'op':
        if (t.v === '(') {
          const e = expr(0);
          if (!isOp(')')) throw new FormulaError('วงเล็บไม่ครบคู่');
          p++;
          return e;
        }
        if (t.v === '-') return { t: 'neg', e: expr(30) };
        if (t.v === '+') return expr(30);
        throw new FormulaError(`มี "${t.v}" ในที่ที่ไม่ควรมี`);
      case 'end':
        throw new FormulaError('สูตรไม่ครบ');
    }
  }

  const n = expr(0);
  if (peek().k !== 'end') throw new FormulaError('อ่านสูตรไม่ออก: มีอะไรเกินมาท้ายสูตร');
  return n;
}

/** A value is a number plus any dice terms (dice only add and subtract). */
interface Val {
  n: number;
  dice: { sign: 1 | -1; text: string }[];
}

export interface Evaluated {
  value: number;
  /** Dice expression for the dice model, or null when the formula has no dice. */
  dice: string | null;
}

export function evaluate(src: string, resolve: Resolver, seen = new Set<string>()): Evaluated {
  const v = run(parse(src), resolve, seen);
  if (!v.dice.length) return { value: v.n, dice: null };
  let out = v.dice.map((d, i) => (d.sign < 0 ? '-' : i ? '+' : '') + d.text).join('');
  if (v.n) out += v.n > 0 ? `+${v.n}` : `${v.n}`;
  return { value: v.n, dice: out };
}

function run(n: Node, resolve: Resolver, seen: Set<string>): Val {
  const pure = (x: Val, what: string) => {
    if (x.dice.length) throw new FormulaError(`${what}กับลูกเต๋าไม่ได้`);
    return x.n;
  };
  switch (n.t) {
    case 'num':
      return { n: n.v, dice: [] };
    case 'ref': {
      const v = resolve(n.name);
      if (v === undefined) throw new FormulaError(`ไม่มีช่อง @${n.name}`);
      if (typeof v === 'number') return { n: v, dice: [] };
      if (seen.has(n.name)) throw new FormulaError(`สูตรวนกลับมาที่ @${n.name}`);
      const inner = new Set(seen).add(n.name);
      return run(parse(v), resolve, inner);
    }
    case 'neg': {
      const x = run(n.e, resolve, seen);
      return { n: -x.n, dice: x.dice.map((d) => ({ ...d, sign: (-d.sign) as 1 | -1 })) };
    }
    case 'bin': {
      const a = run(n.a, resolve, seen), b = run(n.b, resolve, seen);
      if (n.op === '+') return { n: a.n + b.n, dice: [...a.dice, ...b.dice] };
      if (n.op === '-') return { n: a.n - b.n, dice: [...a.dice, ...b.dice.map((d) => ({ ...d, sign: (-d.sign) as 1 | -1 }))] };
      const x = pure(a, n.op === '*' ? 'คูณ' : 'หาร'), y = pure(b, n.op === '*' ? 'คูณ' : 'หาร');
      if (n.op === '/' && y === 0) throw new FormulaError('หารด้วยศูนย์ไม่ได้');
      return { n: n.op === '*' ? x * y : x / y, dice: [] };
    }
    case 'call':
      return { n: FUNCS[n.fn](n.args.map((a) => pure(run(a, resolve, seen), 'ใช้ฟังก์ชัน'))), dice: [] };
    case 'dice': {
      const count = pure(run(n.count, resolve, seen), 'นับจำนวนลูกเต๋า');
      if (!Number.isInteger(count) || count < 1) throw new FormulaError('จำนวนลูกเต๋าต้องเป็นจำนวนเต็มตั้งแต่ 1');
      return { n: 0, dice: [{ sign: 1, text: `${count}d${n.sides === '%' ? 100 : n.sides}${n.keep ?? ''}` }] };
    }
  }
}

/** Field names a formula reads directly (to show dependencies and detect cycles up front). */
export function refsOf(src: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(src)) if (t.k === 'ref' && !out.includes(t.v)) out.push(t.v);
  return out;
}
