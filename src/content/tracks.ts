// Song titles, artists, albums and liner notes for generated tracks.

import type { RecipeId, StationDef, TrackMeta } from '../broadcast/types';
import { expandRule, expandUntil, merge, type Grammar } from './grammar';
import { LIMITS } from './limits';
import { commonGrammar } from './packs/common';
import { RECIPE_PACKS, STATION_PACKS, type TrackPack } from './packs';
import { hashSeed, rngFor } from './rng';

/**
 * Which naming pack a track uses. An explicit `recipe` that differs from the station's main
 * recipe wins (rotating pools, guest slots); otherwise the station's own pack; otherwise its
 * recipe pool (picked by seed) or main recipe.
 */
export function packFor(station: StationDef, seed: number, recipe?: RecipeId): TrackPack {
  const forRecipe = recipe && recipe !== station.recipe ? RECIPE_PACKS[recipe] : undefined;
  if (forRecipe) return forRecipe;
  const own = STATION_PACKS[station.id];
  if (own) return own;
  const pool = station.recipePool;
  if (pool && pool.length > 0) {
    const pick = pool[hashSeed(station.id, 'pool', seed) % pool.length];
    const pooled = pick ? RECIPE_PACKS[pick] : undefined;
    if (pooled) return pooled;
  }
  return RECIPE_PACKS[station.recipe] ?? RECIPE_PACKS['lofi-hiphop']!;
}

/** Accidental stutters like "Crater Crater Dub". */
const STUTTER = /\b(\w+)\s+\1\b/i;

function makeTitle(pack: TrackPack, grammar: Grammar, base: number): string {
  const ok = (s: string) => s.length <= LIMITS.title && (pack.allowStutter === true || !STUTTER.test(s));
  const useFixed = pack.grammar.fixed !== undefined && rngFor(base, 'fixed').chance(pack.fixedChance ?? 0.02);
  const title = expandUntil(grammar, (a) => rngFor(base, 'title', a), useFixed ? '#fixed#' : '#title#', ok, pack.fallbackTitle);
  if (useFixed || pack.grammar.suffix === undefined || title.includes('(')) return title;
  if (!rngFor(base, 'suffix').chance(pack.suffixChance ?? 0.3)) return title;
  for (let a = 0; a < 6; a++) {
    const tagged = `${title} (${expandRule(grammar, rngFor(base, 'suffix', a), 'suffix')})`;
    if (ok(tagged)) return tagged;
  }
  return title;
}

/**
 * Title/artist/album for a generated track. Called by the broadcast director.
 *
 * `recipe` is optional (additive to the v2 contract): pass the recipe actually used for the
 * track so stations with a `recipePool` get names that match the music.
 */
export function trackMeta(station: StationDef, seed: number, recipe?: RecipeId): TrackMeta {
  const pack = packFor(station, seed, recipe);
  const grammar = merge(commonGrammar, pack.grammar);
  const base = hashSeed(station.id, 'track', seed, recipe ?? '');
  const field = (name: string, rule: string, limit: number, fallback: string) =>
    expandUntil(grammar, (a) => rngFor(base, name, a), `#${rule}#`, (s) => s.length <= limit, fallback);

  const meta: TrackMeta = {
    title: makeTitle(pack, grammar, base),
    artist: field('artist', 'artist', LIMITS.artist, station.host.name),
  };
  const extras = rngFor(base, 'extras');
  if (pack.grammar.album && extras.chance(pack.albumChance ?? 0.6)) {
    meta.album = field('album', 'album', LIMITS.album, station.name);
  }
  if (extras.chance(pack.noteChance ?? 0.5)) {
    meta.note = field('note', pack.grammar.note ? 'note' : 'sharedNote', LIMITS.note, 'Recorded somewhere, eventually.');
  }
  return meta;
}
