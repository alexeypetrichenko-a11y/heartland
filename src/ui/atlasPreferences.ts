type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const TERRAIN_KEY = 'heartland.atlas.terrain';
const browserStorage = () => window.localStorage;

export function readTerrainPreference(storage: () => PreferenceStorage = browserStorage): boolean {
  try { return storage().getItem(TERRAIN_KEY) !== 'false'; }
  catch { return true; }
}

export function writeTerrainPreference(visible: boolean, storage: () => PreferenceStorage = browserStorage): void {
  // Safari/storage restrictions must not stop exploration or game navigation.
  try { storage().setItem(TERRAIN_KEY, String(visible)); }
  catch { /* The current tab still retains the preference in React state. */ }
}
