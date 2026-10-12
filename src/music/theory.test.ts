import { describe, expect, it } from 'vitest';
import {
  chordPcs,
  chordScale,
  chordSymbol,
  keyName,
  nearestInSet,
  parseProgression,
  parseRoman,
  pc,
  SCALES,
  scalePcs,
  stepInSet,
  voiceChord,
  voiceMovement,
  voiceProgression,
} from './theory';
import { PROGRESSION_TEMPLATES } from './recipes/templates';

describe('roman numerals', () => {
  it('parses chord families from case and suffix', () => {
    expect(chordSymbol(parseRoman('ii9', 0))).toBe('Dm9');
    expect(chordSymbol(parseRoman('V13', 0))).toBe('G13');
    expect(chordSymbol(parseRoman('Imaj9', 0))).toBe('Cmaj9');
    expect(chordSymbol(parseRoman('bVII9', 0))).toBe('B♭9');
    expect(chordSymbol(parseRoman('iiø7', 0))).toBe('Dm7♭5');
    expect(chordSymbol(parseRoman('IV/V', 0))).toBe('F/G');
    expect(chordSymbol(parseRoman('VI7b9', 5), true)).toBe('D7♭9');
  });

  it('puts the right notes in the chord', () => {
    expect(chordPcs(parseRoman('ii9', 0)).sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 9]); // D F A C E
    expect(chordPcs(parseRoman('V7b9', 0)).sort((a, b) => a - b)).toEqual([2, 5, 7, 8, 11]); // G B D F Ab
  });

  it('parses bars and split bars', () => {
    const prog = parseProgression('ii9 V13 Imaj9+VI7b9', 2);
    expect(prog.map((bar) => bar.length)).toEqual([1, 1, 2]);
    expect(chordSymbol(prog[2]![1]!, false)).toBe('B7♭9');
  });

  it('parses every progression template used by the recipes', () => {
    for (const [name, list] of Object.entries(PROGRESSION_TEMPLATES)) {
      for (const tpl of list) {
        for (let tonic = 0; tonic < 12; tonic++) {
          expect(() => parseProgression(tpl, tonic), `${name}: ${tpl}`).not.toThrow();
        }
      }
    }
  });

  it('names keys with sensible accidentals', () => {
    expect(keyName(3, 'major')).toBe('E♭ major');
    expect(keyName(6, 'major')).toBe('G♭ major');
    expect(keyName(9, 'minor')).toBe('A minor');
    expect(keyName(4, 'dorian')).toBe('E dorian');
  });
});

describe('scales and melody helpers', () => {
  it('snaps and steps within a set', () => {
    const cMajor = scalePcs(0, SCALES.major);
    expect(nearestInSet(61, cMajor)).toBe(62);
    expect(stepInSet(60, cMajor, 2)).toBe(64);
    expect(stepInSet(60, cMajor, -1)).toBe(59);
  });

  it('chord scales swap in altered chord tones', () => {
    const keyScale = scalePcs(0, SCALES.major);
    const a7 = parseRoman('VI7', 0); // A C# E G
    const scale = chordScale(a7, keyScale);
    expect(scale).toContain(1); // C#
    expect(scale).not.toContain(0); // no C natural against a C#
    for (const t of chordPcs(a7)) expect(scale).toContain(t);
  });
});

describe('voice leading', () => {
  const opts = { low: 52, high: 76, voices: 4 };

  it('voices only chord tones inside the range', () => {
    for (const tpl of PROGRESSION_TEMPLATES.lofiMajor!) {
      const chords = parseProgression(tpl, 3).flat();
      for (const v of voiceProgression(chords, opts)) {
        expect(v.length).toBeGreaterThanOrEqual(3);
        for (const n of v) {
          expect(n).toBeGreaterThanOrEqual(52);
          expect(n).toBeLessThanOrEqual(76);
        }
        expect(v[v.length - 1]! - v[0]!).toBeLessThanOrEqual(16);
      }
      chords.forEach((c, i) => {
        const pcs = chordPcs(c);
        for (const n of voiceProgression(chords, opts)[i]!) expect(pcs).toContain(pc(n));
      });
    }
  });

  it('keeps ii–V–I movement small', () => {
    const chords = parseProgression('ii9 V13 Imaj9 Imaj9', 0).flat();
    const vs = voiceProgression(chords, opts);
    for (let i = 1; i < vs.length; i++) {
      // Four voices: on average no more than ~2 semitones each.
      expect(voiceMovement(vs[i - 1]!, vs[i]!)).toBeLessThanOrEqual(8);
    }
  });

  it('bounds movement across every template', () => {
    for (const list of Object.values(PROGRESSION_TEMPLATES)) {
      for (const tpl of list) {
        const chords = parseProgression(tpl, 7).flat();
        const vs = voiceProgression(chords, opts);
        for (let i = 1; i < vs.length; i++) {
          const top = Math.abs(vs[i]![vs[i]!.length - 1]! - vs[i - 1]![vs[i - 1]!.length - 1]!);
          expect(top, tpl).toBeLessThanOrEqual(7);
          expect(voiceMovement(vs[i - 1]!, vs[i]!) / vs[i]!.length, tpl).toBeLessThanOrEqual(3.5);
        }
      }
    }
  });

  it('never puts a minor second on top', () => {
    for (const tpl of PROGRESSION_TEMPLATES.lofiMajor!) {
      for (const v of voiceProgression(parseProgression(tpl, 0).flat(), opts)) {
        expect(v[v.length - 1]! - v[v.length - 2]!).toBeGreaterThan(1);
      }
    }
  });

  it('is deterministic', () => {
    const c = parseRoman('IVmaj9', 4);
    expect(voiceChord(c, [55, 59, 62, 66], opts)).toEqual(voiceChord(c, [55, 59, 62, 66], opts));
  });
});
