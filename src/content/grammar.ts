// A tiny Tracery-style grammar expander.
//
//   #rule#             expand a rule (pick one option at random, expand it recursively)
//   #rule.cap.a#       ...then apply modifiers left to right
//   #name=rule#        expand a rule, remember the result as `name`, and output it
//   #@name#            output a remembered value again (modifiers allowed: #@name.mirror#)
//
// Rules are lists of options or functions of the RNG (for numbers, codes and the like).
// Duplicate an option to weight it.

import type { Rng } from './rng';

export type Rule = readonly string[] | ((rng: Rng) => string);
export type Grammar = Readonly<Record<string, Rule>>;

const MODIFIERS: Record<string, (s: string) => string> = {
  cap: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  title: (s) => s.replace(/(^|[\s(-])([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase()),
  lower: (s) => s.toLowerCase(),
  upper: (s) => s.toUpperCase(),
  a: (s) => (/^[aeiou]/i.test(s) && !/^(uni|one|eu)/i.test(s) ? `an ${s}` : `a ${s}`),
  /** Mirror-world spelling: each word reversed, capitalization kept on the first letter. */
  mirror: (s) =>
    s
      .split(' ')
      .map((w) => {
        const r = [...w.toLowerCase()].reverse().join('');
        return /^[A-Z]/.test(w) ? r.charAt(0).toUpperCase() + r.slice(1) : r;
      })
      .join(' '),
};

const TOKEN = /#([^#\s][^#]*)#/g;
const MAX_DEPTH = 12;

export function expand(grammar: Grammar, rng: Rng, template: string): string {
  const memory = new Map<string, string>();
  return expandText(grammar, rng, template, memory, 0);
}

/** Expands a named rule: equivalent to `expand(grammar, rng, '#rule#')`. */
export function expandRule(grammar: Grammar, rng: Rng, rule: string): string {
  return expand(grammar, rng, `#${rule}#`);
}

function expandText(grammar: Grammar, rng: Rng, text: string, memory: Map<string, string>, depth: number): string {
  if (depth > MAX_DEPTH) throw new Error(`grammar recursion too deep near "${text}"`);
  return text.replace(TOKEN, (_, body: string) => {
    const [head = '', ...mods] = body.split('.');
    let value: string;
    if (head.startsWith('@')) {
      const saved = memory.get(head.slice(1));
      if (saved === undefined) throw new Error(`grammar: "${head}" used before it was saved`);
      value = saved;
    } else {
      const eq = head.indexOf('=');
      const name = eq >= 0 ? head.slice(0, eq) : null;
      const ruleName = eq >= 0 ? head.slice(eq + 1) : head;
      value = expandText(grammar, rng, pickOption(grammar, rng, ruleName), memory, depth + 1);
      if (name) memory.set(name, value);
    }
    for (const mod of mods) {
      const fn = MODIFIERS[mod];
      if (!fn) throw new Error(`grammar: unknown modifier ".${mod}"`);
      value = fn(value);
    }
    return value;
  });
}

function pickOption(grammar: Grammar, rng: Rng, ruleName: string): string {
  const rule = grammar[ruleName];
  if (rule === undefined) throw new Error(`grammar: unknown rule "${ruleName}"`);
  return typeof rule === 'function' ? rule(rng) : rng.pick(rule);
}

/** Rule helper: an integer in a range, as digits. */
export const num =
  (min: number, max: number): Rule =>
  (rng) =>
    String(rng.int(min, max));

/** Rule helper: an integer with thousands separators ("4,000,007"). */
export const bigNum =
  (min: number, max: number): Rule =>
  (rng) =>
    rng.int(min, max).toLocaleString('en-US');

/** Merge grammars; later ones win on rule-name clashes. */
export function merge(...grammars: Grammar[]): Grammar {
  return Object.assign({}, ...grammars) as Grammar;
}

/**
 * Expand `template` repeatedly (with fresh sub-seeds) until `accept` passes. Falls back to
 * `fallback` so callers always get something sensible.
 */
export function expandUntil(
  grammar: Grammar,
  makeRng: (attempt: number) => Rng,
  template: string,
  accept: (s: string) => boolean,
  fallback: string,
  attempts = 24,
): string {
  for (let i = 0; i < attempts; i++) {
    const s = tidy(expand(grammar, makeRng(i), template));
    if (s && accept(s)) return s;
  }
  return fallback;
}

/** Collapse doubled spaces and stray spaces before punctuation. */
export function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}
