import type { SceneId } from '../broadcast/types';
import { SCENES, loadScene } from './registry';

/** Fetch a scene's chunk ahead of time (e.g. the stations either side on the dial). */
export function preloadScene(id: SceneId): void {
  void loadScene(id).catch(() => {});
}

/** The one-sentence description used as the scene's aria-label. */
export function sceneLabel(id: SceneId): string {
  return SCENES[id].label;
}
