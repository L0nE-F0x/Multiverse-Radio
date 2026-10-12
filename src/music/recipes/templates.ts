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

export const SYNTHWAVE: Template[] = [
  { prog: 'i bVI bIII bVII', scale: 'minor' },
  { prog: 'i bVII bVI bVII', scale: 'minor' },
  { prog: 'bVI bVII i i', scale: 'minor' },
  { prog: 'i iv bVI bVII', scale: 'minor' },
  { prog: 'i bVImaj7 bIII bVII', scale: 'minor' },
  { prog: 'bVI bIII bVII iv', scale: 'minor' },
  { prog: 'i v bVI bVII', scale: 'minor' },
  { prog: 'i bVI iv V', scale: 'harmonicMinor' },
  { prog: 'iv bVI bVII i', scale: 'minor' },
  { prog: 'i IV bVII bIII', scale: 'dorian' },
];

/** Lounge jazz: 8-bar A sections (AABA) and bridges. */
export const JAZZ_A: Template[] = [
  { prog: 'Imaj7 vi7 ii7 V7 iii7 VI7b9 ii7 V7', scale: 'major' },
  { prog: 'ii7 V7 Imaj7 Imaj7 ii7 V7 iii7+VI7 ii7+V7', scale: 'major' },
  { prog: 'Imaj7 I7 IVmaj7 iv7+bVII7 iii7 VI7 ii7 V7', scale: 'major' },
  { prog: 'Imaj9 #io7 ii7 V7 Imaj9 VI7b9 ii7 V7', scale: 'major' },
  { prog: 'iii7 VI7 ii7 V7 Imaj7 IV7 iii7+VI7 ii7+V7', scale: 'major' },
  { prog: 'Imaj7 II7 ii7 V7 Imaj7 II7 ii7 V7', scale: 'major' },
];

export const JAZZ_B: Template[] = [
  { prog: 'IVmaj7 IVmaj7 iv7 bVII7 iii7 VI7 ii7 V7', scale: 'major' },
  { prog: 'v7 I7 IVmaj7 IVmaj7 vi7 II7 ii7 V7', scale: 'major' },
  { prog: 'III7 III7 VI7 VI7 II7 II7 ii7 V7', scale: 'major' },
  { prog: 'vi7 II7 Imaj7 VI7 ii7 V7 iii7+VI7 ii7+V7', scale: 'major' },
];

export const JAZZ_MINOR: Template[] = [
  { prog: 'iiø7 V7b9 i7 i7 iv7 bVII7 bIIImaj7 V7b9', scale: 'harmonicMinor' },
  { prog: 'i7 i7 iv7 bVII7 bIIImaj7 bVImaj7 iiø7 V7b9', scale: 'minor' },
];

export const MUZAK: Template[] = [
  { prog: 'Imaj7 vi7 ii7 V7', scale: 'major' },
  { prog: 'Imaj7 II7 ii7 V7', scale: 'major' },
  { prog: 'Imaj7 IVmaj7 iii7 vi7 ii7 V7 Imaj7 V7sus', scale: 'major' },
  { prog: 'IVmaj7 V7 iii7 vi7', scale: 'major' },
  { prog: 'Imaj9 iii7 IVmaj7 V9sus', scale: 'major' },
  { prog: 'Imaj7 VI7 ii7 V7', scale: 'major' },
  { prog: 'ii7 V7 Imaj7 IVmaj7', scale: 'major' },
];

export const AMBIENT: Template[] = [
  { prog: 'Imaj9 vi9 IVmaj7#11 V9sus', scale: 'lydian' },
  { prog: 'Imaj9 IVmaj9 Imaj9 bVIImaj9', scale: 'mixolydian' },
  { prog: 'i9 bVImaj9 bIIImaj9 bVII69', scale: 'dorian' },
  { prog: 'IVmaj9 Imaj9 vi9 V9sus', scale: 'major' },
  { prog: 'i9 IV9 i9 bVIImaj9', scale: 'dorian' },
  { prog: 'Imaj7#11 II/I Imaj7#11 vii7', scale: 'lydian' },
];

export const CHIPTUNE: Template[] = [
  { prog: 'I V vi IV', scale: 'major' },
  { prog: 'vi IV I V', scale: 'major' },
  { prog: 'I vi IV V', scale: 'major' },
  { prog: 'IV V iii vi', scale: 'major' },
  { prog: 'I IV I V', scale: 'major' },
  { prog: 'i bVI bVII i', scale: 'minor' },
  { prog: 'i bVII bVI V', scale: 'harmonicMinor' },
  { prog: 'i iv bVII bIII', scale: 'minor' },
  { prog: 'I bVII IV I', scale: 'mixolydian' },
];

export const BAROQUE_MAJOR: Template[] = [
  { prog: 'I IV viio iii vi ii V I', scale: 'major' },
  { prog: 'I V vi iii IV I IV V', scale: 'major' },
  { prog: 'I vi ii V I vi IV V', scale: 'major' },
  { prog: 'I IV I V vi ii V7 I', scale: 'major' },
];

export const BAROQUE_MINOR: Template[] = [
  { prog: 'i iv bVII bIII bVI iio V i', scale: 'harmonicMinor' },
  { prog: 'i V i iv bVI iv V V', scale: 'harmonicMinor' },
  { prog: 'i bVII bVI V i iv V7 i', scale: 'harmonicMinor' },
];

export const DUB: Template[] = [
  { prog: 'i i iv iv', scale: 'minor' },
  { prog: 'i bVII i bVII', scale: 'minor' },
  { prog: 'i bVI bVII i', scale: 'minor' },
  { prog: 'iv iv i i', scale: 'minor' },
  { prog: 'i i v v', scale: 'minor' },
  { prog: 'i7 i7 IV7 IV7', scale: 'dorian' },
];

/** Polka strains in 2/4 (one chord per bar). */
export const POLKA: Template[] = [
  { prog: 'I I V7 V7 V7 V7 I I', scale: 'major' },
  { prog: 'I I I V7 V7 V7 V7 I', scale: 'major' },
  { prog: 'I I IV IV V7 V7 I I', scale: 'major' },
  { prog: 'I V7 I V7 I IV V7 I', scale: 'major' },
];

export const TROPICAL: Template[] = [
  { prog: 'I IV V IV', scale: 'major' },
  { prog: 'I vi IV V', scale: 'major' },
  { prog: 'Imaj7 IV6 V7 Imaj7', scale: 'major' },
  { prog: 'IV V I vi', scale: 'major' },
  { prog: 'ii7 V7 Imaj7 Imaj7', scale: 'major' },
  { prog: 'I IV I V7', scale: 'major' },
];

export const LULLABY: Template[] = [
  { prog: 'I IV I V', scale: 'major' },
  { prog: 'I vi IV V', scale: 'major' },
  { prog: 'I iii IV I', scale: 'major' },
  { prog: 'I IV ii V', scale: 'major' },
  { prog: 'I V vi IV', scale: 'major' },
];

export const NUMBERS: Template[] = [
  { prog: 'i i iv v', scale: 'dorian' },
  { prog: 'i bVII bVI V', scale: 'harmonicMinor' },
  { prog: 'i bII i i', scale: 'phrygian' },
  { prog: 'i iv i V', scale: 'harmonicMinor' },
];

export const NEWS: Template[] = [
  { prog: 'i bVI bVII i', scale: 'minor' },
  { prog: 'i iv bVI v', scale: 'minor' },
  { prog: 'Isus2 bVIIsus2 IVsus2 Isus2', scale: 'mixolydian' },
  { prog: 'i5 bVI5 bIII5 bVII5', scale: 'minor' },
];

export const TALK: Template[] = [
  { prog: 'Imaj7 IVmaj7 Imaj7 IVmaj7', scale: 'major' },
  { prog: 'ii7 V7 Imaj7 vi7', scale: 'major' },
  { prog: 'Imaj7 vi7 ii7 V7', scale: 'major' },
  { prog: 'i7 IV7 i7 IV7', scale: 'dorian' },
  { prog: 'IVmaj7 iii7 ii7 Imaj7', scale: 'major' },
];

export const FANFARE: Template[] = [
  { prog: 'I bVII IV I', scale: 'mixolydian' },
  { prog: 'I IV V I', scale: 'major' },
  { prog: 'I bVI bVII I', scale: 'mixolydian' },
  { prog: 'I V vi IV', scale: 'major' },
];

export const DOCUMENTARY: Template[] = [
  { prog: 'Imaj7 IVmaj7#11 vi9 V9sus', scale: 'lydian' },
  { prog: 'vi IV I V', scale: 'major' },
  { prog: 'I iii vi IV', scale: 'major' },
  { prog: 'IV I V vi', scale: 'major' },
  { prog: 'i bVI bIII bVII', scale: 'minor' },
];

/** Every template string, grouped, so tests can check they all parse and voice well. */
export const PROGRESSION_TEMPLATES: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    lofiMajor: LOFI_MAJOR,
    lofiMinor: LOFI_MINOR,
    lofiGlass: LOFI_GLASS,
    synthwave: SYNTHWAVE,
    jazzA: JAZZ_A,
    jazzB: JAZZ_B,
    jazzMinor: JAZZ_MINOR,
    muzak: MUZAK,
    ambient: AMBIENT,
    chiptune: CHIPTUNE,
    baroqueMajor: BAROQUE_MAJOR,
    baroqueMinor: BAROQUE_MINOR,
    dub: DUB,
    polka: POLKA,
    tropical: TROPICAL,
    lullaby: LULLABY,
    numbers: NUMBERS,
    news: NEWS,
    talk: TALK,
    fanfare: FANFARE,
    documentary: DOCUMENTARY,
  }).map(([k, list]) => [k, list.map((t) => t.prog)]),
);
