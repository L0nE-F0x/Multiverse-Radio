// Chord progression templates (roman numerals; see theory.parseRoman). Whitespace
// separates bars, "+" splits a bar. Progressions are generic harmonic formulas.

import type { ScaleName } from '../theory';

export interface Template {
  prog: string;
  scale: ScaleName;
}

export const LOFI_MAJOR: Template[] = [
  { prog: 'Imaj9 vi9 ii9 V13', scale: 'major' },
  { prog: 'ii9 V13 Imaj9 VI7b9', scale: 'major' },
  { prog: 'IVmaj9 iii7 ii9 Imaj9', scale: 'major' },
  { prog: 'IVmaj7 III7 vi9 I7', scale: 'major' },
  { prog: 'Imaj7 iii7 IVmaj7 iv6', scale: 'major' },
  { prog: 'vi9 ii9 V13 Imaj9', scale: 'major' },
  { prog: 'ii9 bII7#11 Imaj9 vi9', scale: 'major' },
  { prog: 'IVmaj9 iv9 Imaj9 VI7b9', scale: 'major' },
  { prog: 'Imaj9 IVmaj9 iii7 VI7', scale: 'major' },
  { prog: 'vi9 IVmaj9 Imaj9 V9sus', scale: 'major' },
  { prog: 'iii7 VI7b9 ii9 V13', scale: 'major' },
  { prog: 'Imaj9 bVII9 IVmaj9 iv6', scale: 'major' },
  { prog: 'ii9 iii7 IVmaj9 V9sus', scale: 'major' },
  { prog: 'Imaj9 vi9 IVmaj9 V7sus+V7b9', scale: 'major' },
  { prog: 'Imaj9 vi9 ii9 V13 iii7 VI7b9 ii9 V9sus', scale: 'major' },
  { prog: 'IVmaj9 iii7 vi9 I7 IVmaj9 iv9 Imaj9 V13', scale: 'major' },
];

export const LOFI_MINOR: Template[] = [
  { prog: 'i9 IV9 bVIImaj9 bIIImaj7', scale: 'dorian' },
  { prog: 'i9 bVImaj9 iv9 v9', scale: 'minor' },
  { prog: 'i9 iv9 bVII13 bIIImaj9', scale: 'minor' },
  { prog: 'i9 bIIImaj9 bVImaj9 V7#9', scale: 'minor' },
  { prog: 'iiø7 V7b9 i9 bVImaj9', scale: 'harmonicMinor' },
  { prog: 'i11 bVIImaj9 bVImaj9 V7b9', scale: 'minor' },
  { prog: 'iv9 bVII13 bIIImaj9 bVImaj9', scale: 'minor' },
  { prog: 'i9 iv9 v9 bVImaj9', scale: 'dorian' },
  { prog: 'i9 i9 IV9 IV9', scale: 'dorian' },
  { prog: 'bVImaj9 v9 iv9 i9', scale: 'minor' },
  { prog: 'iv9 bVII13 bIIImaj9 bVImaj9 iiø7 V7b9 i9 i9', scale: 'minor' },
];

export const LOFI_GLASS: Template[] = [
  { prog: 'Imaj7#11 vi9 IVmaj9 V9sus', scale: 'lydian' },
  { prog: 'IVmaj7#11 iii7 vi9 Imaj9', scale: 'major' },
  { prog: 'Imaj9 II/I Imaj9 II/I', scale: 'lydian' },
  { prog: 'Imaj7#11 bVImaj7#11 Imaj7#11 bVImaj7#11', scale: 'lydian' },
  { prog: 'IVmaj9 V9sus iii7 vi9', scale: 'major' },
  { prog: 'Imaj9 iii7 IVmaj7#11 IVmaj7#11', scale: 'lydian' },
];

/** Every template string, grouped, so tests can check they all parse and voice well. */
export const PROGRESSION_TEMPLATES: Record<string, string[]> = {
  lofiMajor: LOFI_MAJOR.map((t) => t.prog),
  lofiMinor: LOFI_MINOR.map((t) => t.prog),
  lofiGlass: LOFI_GLASS.map((t) => t.prog),
};
