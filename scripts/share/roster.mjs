// Loads the station roster (TypeScript) from Node for the share pages and cards, through Vite's
// module runner, so the roster stays the single source of truth.

import path from 'node:path';
import { runnerImport } from 'vite';

/**
 * Main (non-secret) stations along the dial, each with a one-sentence description of its
 * scene (the scene registry's screen-reader label, or the fallback's for undrawn scenes).
 * @param {string} root project root
 * @returns {Promise<{ station: any, index: number, sceneLabel: string | undefined, sceneDrawn: boolean }[]>}
 */
export async function loadShareStations(root) {
  const options = { root, configFile: false, logLevel: 'silent' };
  const { module: roster } = await runnerImport(path.join(root, 'src/stations/roster.ts'), options);
  let scenes = null;
  try {
    ({ module: scenes } = await runnerImport(path.join(root, 'src/scenes/registry.ts'), options));
  } catch {
    // The scene registry is browser code; if it ever stops loading in Node, cards and pages
    // simply go without a scene description.
  }
  return roster.MAIN_STATIONS.map((station, index) => ({
    station,
    index,
    sceneLabel: scenes?.sceneEntry?.(station.scene)?.label,
    sceneDrawn: Boolean(scenes?.SCENES?.[station.scene]),
  }));
}
