// Fake voice manifests for the director lab, so voice playback, ducking, captions and clip
// failures can be tested before the real library is rendered. They point at the v1 test
// MP3s under /audio/ (cut to length by the slot, like any over-long clip), plus a couple of
// deliberately missing files to exercise the "music fills the slot" path.
//
// Dev tooling only: nothing in the product imports this.

import type { VoiceLibrary } from './library';
import type { StationDef, VoiceCategory, VoiceClip, VoiceManifest } from './types';

const FILES = [
  ['/audio/classifieds/episode-001.mp3', 30_000],
  ['/audio/classifieds/episode-002.mp3', 41_000],
  ['/audio/classifieds/episode-003.mp3', 57_200],
  ['/audio/hop/episode-001.mp3', 50_100],
  ['/audio/hop/episode-002.mp3', 44_200],
  ['/audio/hop/episode-003.mp3', 48_700],
  ['/audio/plumbus/episode-001.mp3', 60_400],
  ['/audio/plumbus/episode-002.mp3', 52_100],
  ['/audio/plumbus/episode-003.mp3', 52_200],
  ['/audio/rixty/episode-001.mp3', 58_900],
  ['/audio/rixty/episode-002.mp3', 53_800],
  ['/audio/rixty/episode-003.mp3', 46_600],
] as const;

const STATIC_FILE = '/audio/static/ambient-001.mp3';

function lines(speaker: string, label: string, durationMs: number): VoiceClip['lines'] {
  const count = Math.max(1, Math.floor(durationMs / 3500));
  return Array.from({ length: count }, (_, i) => ({
    speaker,
    text: i === 0 ? `[fake ${label}] Testing, testing, this is line one.` : `[fake ${label}] Caption line ${i + 1} of ${count}.`,
    startMs: i * 3500,
  }));
}

function clip(
  owner: string,
  n: number,
  category: VoiceCategory,
  file: string,
  durationMs: number,
  speaker: string,
  extra: Partial<VoiceClip> = {},
): VoiceClip {
  const id = `${category}-${String(n).padStart(3, '0')}`;
  return {
    id,
    category,
    // The fragment keeps clips distinct (rotation, cache) while sharing one file.
    url: `${file}#${owner}-${id}`,
    durationMs,
    title: `Fake ${category} ${n}`,
    overMusic: category === 'id' || category === 'dj' || category === 'interrupt',
    lines: lines(speaker, `${category} ${n}`, durationMs),
    ...extra,
  };
}

/** A small fake library for one station, sized for its format. */
export function fakeStationManifest(station: StationDef): VoiceManifest {
  const host = station.host.name;
  const pick = (i: number) => FILES[(i + Math.round(station.frequency * 10)) % FILES.length]!;
  const clips: VoiceClip[] = [];
  for (let i = 0; i < 6; i++) clips.push(clip(station.id, i, 'id', pick(i)[0], 4000 + (i % 3) * 1500, host));
  for (let i = 0; i < 8; i++) clips.push(clip(station.id, i, 'dj', pick(i + 3)[0], 12_000 + (i % 4) * 4000, host));
  const talky = station.format === 'talk' || station.format === 'mixed';
  const content: VoiceCategory[] = talky ? ['news', 'call', 'story', 'weather', 'news', 'call', 'story', 'show'] : ['weather', 'news'];
  content.forEach((category, i) => {
    const [file, duration] = pick(i + 5);
    clips.push(clip(station.id, i, category, file, duration, i % 2 ? (station.cast?.[0]?.name ?? host) : host));
  });
  // A clip whose file doesn't exist: the director should fill its slot with music.
  clips.push(clip(station.id, 99, 'dj', '/audio/missing/nowhere.mp3', 9000, host));
  return { version: 1, station: station.id, clips };
}

export function fakeSharedManifest(): VoiceManifest {
  const clips: VoiceClip[] = [
    ...[0, 1, 2].map((i) => clip('_shared', i, 'ad', FILES[i]![0], FILES[i]![1], 'The Sponsor')),
    clip('_shared', 3, 'ad', FILES[6]![0], 20_000, 'The Sponsor', { stations: ['every-news'] }),
    clip('_shared', 0, 'psa', FILES[4]![0], 15_000, 'A Concerned Official'),
    clip('_shared', 0, 'interrupt', STATIC_FILE, 4_000, '???', { lines: [{ speaker: '???', text: '[bleed from another station]', startMs: 0 }] }),
    clip('_shared', 1, 'interrupt', STATIC_FILE, 6_000, '???', { lines: [{ speaker: '???', text: '[emergency static]', startMs: 0 }] }),
  ];
  return { version: 1, station: '_shared', clips };
}

/** Swaps every station's manifest for fake ones (or back to the real files). */
export function setFakeVoice(library: VoiceLibrary, stations: StationDef[], on: boolean): void {
  if (!on) {
    library.clearOverrides();
    return;
  }
  library.setOverride('_shared', fakeSharedManifest());
  for (const station of stations) library.setOverride(station.id, fakeStationManifest(station));
}
