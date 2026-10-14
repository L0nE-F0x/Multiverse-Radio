// v4 groove recipes (owned by the music-groove workstream): disco, space-funk,
// warehouse-techno, heat-death-house. Their instruments live in dsp/groove.ts.

import type { RecipeId } from '../../broadcast/types';
import { composeDisco } from './disco';
import { composeHeatDeathHouse } from './heat-death-house';
import type { Composer } from './index';
import { composeSpaceFunk } from './space-funk';
import { composeWarehouseTechno } from './warehouse-techno';

export const GROOVE_V4: Partial<Record<RecipeId, Composer>> = {
  disco: composeDisco,
  'space-funk': composeSpaceFunk,
  'warehouse-techno': composeWarehouseTechno,
  'heat-death-house': composeHeatDeathHouse,
};
