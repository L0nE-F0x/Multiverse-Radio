// Tests for the deep band (writers-deep): pirate identities, HUSH's ship-log notes, and light
// checks over the deep voice scripts (HUSH, pirates, oddities, events, the secret stations).
// The full voice schema is validated by the renderer; this guards what a writer can slip on.

import { describe, expect, it } from 'vitest';
import { EVENT_IDS, ODDITY_IDS } from '../broadcast/types';
import { findBanned } from './banned';
import { PIRATE_LIMITS, pirateIdentity, SHIP_LOG_NOTE_MAX, shipLogNote } from './index';
import { PIRATE_GRAMMAR } from './pirates';
import { hashSeed } from './rng';

const SEEDS = Array.from({ length: 2000 }, (_, i) => hashSeed('deep-test', i));

function expectClean(text: string, context: string) {
  expect(text.trim().length, `${context}: empty`).toBeGreaterThan(0);
  expect(findBanned(text), `${context}: banned word in "${text}"`).toBeNull();
  expect(text, `${context}: unexpanded grammar token`).not.toMatch(/#[a-zA-Z@]/);
  expect(text, `${context}: doubled space`).not.toMatch(/ {2}/);
  expect(text, `${context}: stray space before punctuation`).not.toMatch(/ [,.;:!?]/);
}

/** 1 / P(two random draws are equal), estimated from collisions. */
function effectiveVocabulary(values: string[]): number {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let pairs = 0;
  for (const c of counts.values()) pairs += c * (c - 1);
  return pairs === 0 ? Infinity : (values.length * (values.length - 1)) / pairs;
}

/** Real stations and shows a generated pirate must never be named after. */
const REAL_NAMES = /radio free (europe|asia)|radio (caroline|luxembourg|one|two|four|city|nowhere)\b|\b(kiss|capital|heart|jazz|classic|magic) fm\b|late late show|hour of power/i;

describe('pirateIdentity', () => {
  it('is deterministic', () => {
    for (const seed of SEEDS.slice(0, 200)) expect(pirateIdentity(seed)).toEqual(pirateIdentity(seed));
  });

  it('produces clean fields within their limits', () => {
    for (const seed of SEEDS) {
      const p = pirateIdentity(seed);
      const ctx = `pirate#${seed}`;
      expectClean(p.name, `${ctx} name`);
      expectClean(p.slogan, `${ctx} slogan`);
      expectClean(p.origin, `${ctx} origin`);
      expectClean(p.host.name, `${ctx} host`);
      expectClean(p.host.bio, `${ctx} bio`);
      expect(p.name.length, p.name).toBeLessThanOrEqual(PIRATE_LIMITS.name);
      expect(p.slogan.length, p.slogan).toBeLessThanOrEqual(PIRATE_LIMITS.slogan);
      expect(p.origin.length, p.origin).toBeLessThanOrEqual(PIRATE_LIMITS.origin);
      expect(p.host.name.length, p.host.name).toBeLessThanOrEqual(PIRATE_LIMITS.hostName);
      expect(p.host.bio.length, p.host.bio).toBeLessThanOrEqual(PIRATE_LIMITS.hostBio);
      expect(p.name, 'starts with a capital').toMatch(/^[A-Z]/);
      expect(p.name, 'named after a real station').not.toMatch(REAL_NAMES);
      expect(p.name, 'accidental stutter').not.toMatch(/\b(\w+)\s+\1\b/i);
    }
  });

  it('practically never repeats a name', () => {
    // A listener who browses fifty pirates should meet a repeated name about one time in
    // fifty or less: effective vocabulary of ~27,000 when measured; 20,000 leaves slack.
    const names = Array.from({ length: 20_000 }, (_, i) => pirateIdentity(hashSeed('pirate-vocab', i)).name);
    expect(effectiveVocabulary(names)).toBeGreaterThan(20_000);
    // Small raw seeds (say, dial steps) are just as varied.
    const steps = Array.from({ length: 1680 }, (_, i) => pirateIdentity(i).name);
    expect(new Set(steps).size).toBeGreaterThan(1680 * 0.95);
  });

  it('can produce the pirates the DJs give shout-outs to', () => {
    // content/voice/_pirate.toml: Radio Free Shed, the Midnight Wrong Number, the Unlicensed
    // Hour, the Kitchen Table Broadcasting Company.
    const has = (rule: string, value: string) => expect(PIRATE_GRAMMAR[rule], rule).toContain(value);
    has('place', 'Shed');
    has('timeAdj', 'Midnight');
    has('timeAdj', 'Unlicensed');
    has('oddThing', 'Wrong Number');
    has('oddThing', 'Hour');
    has('furniture', 'Kitchen Table');
    has('company', 'Company');
  });
});

describe('shipLogNote', () => {
  it('is deterministic, clean and short', () => {
    for (const seed of SEEDS) {
      const note = shipLogNote(seed);
      expect(note).toBe(shipLogNote(seed));
      expectClean(note, `log#${seed}`);
      expect(note.length, note).toBeLessThanOrEqual(SHIP_LOG_NOTE_MAX);
      expect(note, 'ends like a sentence').toMatch(/[.!?]$/);
    }
  });

  it('rarely repeats within a long shift', () => {
    const notes = Array.from({ length: 5000 }, (_, i) => shipLogNote(hashSeed('log-vocab', i)));
    expect(effectiveVocabulary(notes)).toBeGreaterThan(1000);
    expect(new Set(notes.slice(0, 400)).size).toBeGreaterThan(400 * 0.8);
  });
});

// ── Voice scripts ─────────────────────────────────────────────────────────────

const SCRIPTS = import.meta.glob<string>('/content/voice/*.toml', { query: '?raw', import: 'default', eager: true });
const V4_SECRET = ['the-switchboard', 'minute-between', 'the-harbour', 'something-listening'];
const MINE = ['_ship', '_pirate', '_oddities', '_events', 'hush-after-hours', 'last-lighthouse', 'transmission-zero', ...V4_SECRET];
const SECRET = ['hush-after-hours', 'last-lighthouse', 'transmission-zero', ...V4_SECRET];
/** The Convergence's weekly topics (content/voice/SCHEMA.md). */
const CONVERGENCE_KITS = ['missing-moon', 'the-smell', 'the-song', 'the-knock', 'wrong-colour', 'the-pigeon'];

interface Block {
  kind: 'clip' | 'show';
  fields: Record<string, string>;
  body: string;
}

/** Splits a script into its [[clip]] and [[show]] blocks and reads their top-level scalar keys. */
function blocks(toml: string): Block[] {
  const parts = toml.split(/^\[\[(clip|show)\]\]$/m);
  const out: Block[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1] ?? '';
    const fields: Record<string, string> = {};
    for (const m of body.matchAll(/^([a-z_]+) = ("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|\[[^\n]*\])$/gm)) {
      fields[m[1]!] = m[2]!.replace(/^"|"$/g, '');
    }
    out.push({ kind: parts[i] as 'clip' | 'show', fields, body });
  }
  return out;
}

function clipsOf(id: string): Block[] {
  return blocks(SCRIPTS[`/content/voice/${id}.toml`] ?? '').filter((b) => b.kind === 'clip');
}

describe('deep voice scripts', () => {
  for (const id of MINE) {
    it(`${id}: clean, sayable text and unique ids`, () => {
      const toml = SCRIPTS[`/content/voice/${id}.toml`];
      expect(toml, `content/voice/${id}.toml is missing`).toBeDefined();
      expect(toml).toMatch(new RegExp(`^station = "${id}"$`, 'm'));
      const ids = clipsOf(id).map((c) => c.fields.id);
      expect(ids.every(Boolean), 'every clip has an id').toBe(true);
      expect(new Set(ids).size, 'duplicate clip ids').toBe(ids.length);
      const texts = [...toml!.matchAll(/\btext = "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? '');
      expect(texts.length).toBeGreaterThan(15);
      for (const text of texts) {
        expect(findBanned(text), `banned term in "${text}"`).toBeNull();
        expect(text, 'spell numbers out for the TTS voice').not.toMatch(/\d/);
        expect(text, 'symbol the voice cannot say').not.toMatch(/[%&#@/+=<>*_~^|$€£]/);
        expect(text.length).toBeLessThanOrEqual(300);
      }
    });
  }

  it('_ship: HUSH has plenty to say at every strangeness level', () => {
    const clips = clipsOf('_ship');
    expect(clips.length).toBeGreaterThanOrEqual(70);
    const byLevel = [0, 1, 2, 3].map((l) => clips.filter((c) => c.fields.level === String(l)).length);
    for (const n of byLevel) expect(n).toBeGreaterThanOrEqual(12);
    for (const c of clips) {
      expect(c.fields.category, c.fields.id).toBe('ship');
      expect(['0', '1', '2', '3'], c.fields.id).toContain(c.fields.level);
    }
    expect(clips.some((c) => c.fields.dates?.includes('10-31')), 'a Halloween line').toBe(true);
  });

  it('_events: every multiverse event has clips', () => {
    const clips = clipsOf('_events');
    for (const c of clips) {
      expect(c.fields.category, c.fields.id).toBe('event');
      expect(EVENT_IDS as readonly string[], c.fields.id).toContain(c.fields.event);
    }
    for (const event of EVENT_IDS) expect(clips.filter((c) => c.fields.event === event).length, event).toBeGreaterThanOrEqual(5);
  });

  it('_ship: the off-course arc has steps 1 to 8, once each, in order', () => {
    const steps = clipsOf('_ship')
      .map((c) => ({ id: c.fields.id!, arc: /^arc = \{ id = "([a-z-]+)", step = (\d+) \}$/m.exec(c.body) }))
      .filter((c) => c.arc);
    expect(steps.every((s) => s.arc![1] === 'off-course'), 'only the off-course arc').toBe(true);
    expect(steps.map((s) => Number(s.arc![2]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Step 7 names The Harbour's frequency; it must say it the way the dial shows it.
    const seven = clipsOf('_ship').find((c) => c.fields.id === steps[6]!.id)!;
    expect(seven.body).toMatch(/one hundred and forty point oh/i);
    expect(seven.body).toMatch(/left a light on/);
  });

  it('_ship: a jam kit for Free Frequency, and evasive heading notices at every level', () => {
    const clips = clipsOf('_ship');
    const jam = clips.filter((c) => c.fields.kit === 'jam');
    expect(jam.length).toBeGreaterThanOrEqual(8);
    for (const c of jam) {
      expect(c.fields.stations, c.fields.id).toBe('["free-frequency"]');
      expect(c.fields.part, `${c.fields.id}: jam lines stand alone`).toBeUndefined();
    }
    const heading = clips.filter((c) => c.fields.kit === 'heading');
    expect(heading.length).toBeGreaterThanOrEqual(15);
    for (const level of ['0', '1', '2', '3']) expect(heading.some((c) => c.fields.level === level), `heading level ${level}`).toBe(true);
    expect(clips.filter((c) => c.fields.kit === 'outer-band').length).toBeGreaterThanOrEqual(1);
  });

  it('_events: the Convergence has an open and a close per kit, with variants', () => {
    const conv = clipsOf('_events').filter((c) => c.fields.event === 'convergence');
    for (const c of conv) {
      expect(CONVERGENCE_KITS, c.fields.id).toContain(c.fields.kit);
      expect(['open', 'close'], c.fields.id).toContain(c.fields.part);
    }
    for (const kit of CONVERGENCE_KITS) {
      for (const part of ['open', 'close']) {
        const n = conv.filter((c) => c.fields.kit === kit && c.fields.part === part).length;
        expect(n, `${kit} ${part}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  for (const id of SECRET) {
    it(`${id}: one Convergence reaction per kit`, () => {
      const reactions = clipsOf(id).filter((c) => c.fields.event === 'convergence');
      for (const c of reactions) {
        expect(c.fields.category, c.fields.id).toBe('event');
        expect(c.fields.part, `${c.fields.id}: reactions aren't modular parts`).toBeUndefined();
      }
      expect(reactions.map((c) => c.fields.kit).sort()).toEqual([...CONVERGENCE_KITS].sort());
    });
  }

  it('the-switchboard: a complete calls kit', () => {
    const calls = clipsOf('the-switchboard').filter((c) => c.fields.kit === 'calls');
    for (const part of ['open', 'body', 'close']) expect(calls.filter((c) => c.fields.part === part).length, part).toBeGreaterThanOrEqual(part === 'body' ? 8 : 4);
  });

  it('something-listening: it notices you first', () => {
    expect(clipsOf('something-listening').some((c) => c.fields.id === 'noticed')).toBe(true);
  });

  it('_oddities: clip ids are keyed by oddity', () => {
    const clips = clipsOf('_oddities');
    for (const c of clips) expect(ODDITY_IDS.some((o) => c.fields.id!.startsWith(`${o}-`)), c.fields.id).toBe(true);
    for (const oddity of ODDITY_IDS) expect(clips.filter((c) => c.fields.id!.startsWith(`${oddity}-`)).length, oddity).toBeGreaterThanOrEqual(3);
  });

  it('_pirate: never names a station', () => {
    const toml = SCRIPTS['/content/voice/_pirate.toml']!;
    expect(toml).not.toMatch(/You're (listening|tuned) to [A-Z]/);
  });

  for (const id of SECRET) {
    it(`${id}: a full station with shows that open properly`, () => {
      const all = blocks(SCRIPTS[`/content/voice/${id}.toml`] ?? '');
      const clips = all.filter((b) => b.kind === 'clip');
      const shows = all.filter((b) => b.kind === 'show');
      expect(clips.length).toBeGreaterThanOrEqual(20);
      expect(shows.length).toBeGreaterThanOrEqual(1);
      for (const show of shows) {
        const { id: showId, start, end } = show.fields;
        expect(showId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(Number(start)).toBeGreaterThanOrEqual(0);
        expect(Number(end)).toBeLessThanOrEqual(24);
        expect(clips.some((c) => c.fields.show === showId && c.fields.part === 'open' && c.fields.category === 'id'), `${showId} has an open`).toBe(true);
      }
      const showIds = new Set(shows.map((s) => s.fields.id));
      for (const c of clips) if (c.fields.show) expect(showIds.has(c.fields.show), `${c.fields.id} → ${c.fields.show}`).toBe(true);
    });
  }
});
