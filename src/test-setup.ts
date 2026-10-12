// Vitest setup: tests expect real track names, so load the lazily loaded naming packs first.
import { loadTrackPacks } from './content';

await loadTrackPacks();
