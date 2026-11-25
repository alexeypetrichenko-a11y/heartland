import type { LoadedEconomy } from './economyBridge.ts';
import { createSaveSlot, type SaveStatus } from './localSaveSlot.ts';
import { decodeGameSave, encodeGameSave, type PlayableSession, type SavedGame } from './saveFormat.ts';

export type { SaveAvailability, SaveStatus } from './localSaveSlot.ts';

export function createLocalSaves(onStatus: (status: SaveStatus) => void) {
  type Input = { runtime: LoadedEconomy; session: PlayableSession };
  const slot = createSaveSlot<Input, SavedGame>('heartland-game', onStatus, {
    encode: ({ runtime, session }) => encodeGameSave(runtime, session),
    decode: record => decodeGameSave(record),
    week: ({ session }) => session.game.week,
  });
  return { lookup: slot.lookup, flush: slot.flush,
    schedule: (runtime: LoadedEconomy, session: PlayableSession, delay = 0) => slot.schedule({ runtime, session }, delay) };
}
