const STORE = 'saves';
const SLOT = 'active';
type SlotValue = string | null | false;

export type SaveAvailability =
  | { kind: 'empty' }
  | { kind: 'found' }
  | { kind: 'unreadable' | 'unavailable'; message: string };

type SaveLookup<Save> = Exclude<SaveAvailability, { kind: 'found' }> | { kind: 'found'; save: Save };
export type SaveStatus =
  | { kind: 'saving' | 'saved'; week: number }
  | { kind: 'failed'; message: string };

class SaveConflict extends Error {}
const messageOf = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function openDatabase(database: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Local storage is blocked by another tab.'));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
  });
}

function slotValue(value: unknown): SlotValue {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : false;
}

async function accessSlot(database: string, write?: { expected: SlotValue; record: string }): Promise<SlotValue> {
  const db = await openDatabase(database);
  try {
    return await new Promise((resolve, reject) => {
      const tx = write ? db.transaction(STORE, 'readwrite', { durability: 'strict' }) : db.transaction(STORE, 'readonly');
      let value: SlotValue = null;
      let failure: unknown;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('The save transaction was interrupted.'));
      const store = tx.objectStore(STORE);
      const read = store.get(SLOT);
      read.onsuccess = () => {
        value = slotValue(read.result);
        if (!write) return;
        // Read and replace in the same transaction, including when another tab is active.
        try {
          if (value !== write.expected) throw new SaveConflict('Another tab changed the local save. Reload before saving again.');
          store.put(write.record, SLOT);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}

export function createSaveSlot<Input, Save>(database: string, onStatus: (status: SaveStatus) => void, codec: {
  encode: (input: Input) => Promise<string>;
  decode: (record: string) => Promise<Save>;
  week: (input: Input) => number;
}) {
  let expected: SlotValue | undefined;
  let pending: { input: Input } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing = false;

  async function lookup(): Promise<SaveLookup<Save>> {
    let record: SlotValue;
    try {
      record = await accessSlot(database);
      expected = record;
    } catch (error) {
      const reason = error instanceof DOMException ? 'Local storage is unavailable.' : messageOf(error, 'Local storage is unavailable.');
      return { kind: 'unavailable', message: reason };
    }
    if (record === null) return { kind: 'empty' };
    if (record === false) return { kind: 'unreadable', message: 'The local save could not be read.' };
    try {
      return { kind: 'found', save: await codec.decode(record) };
    } catch (error) {
      return { kind: 'unreadable', message: messageOf(error, 'The local save could not be read.') };
    }
  }

  async function drain() {
    if (writing || !pending) return;
    writing = true;
    while (pending) {
      const { input } = pending;
      pending = undefined;
      const week = codec.week(input);
      onStatus({ kind: 'saving', week });
      try {
        const record = await codec.encode(input);
        await accessSlot(database, { expected: expected ?? null, record });
        expected = record;
        onStatus({ kind: 'saved', week });
      } catch (error) {
        const message = error instanceof SaveConflict ? error.message
          : error instanceof DOMException && error.name === 'QuotaExceededError' ? 'Local storage is full.'
          : 'Local save failed. Check browser storage and try again.';
        onStatus({ kind: 'failed', message });
      }
    }
    writing = false;
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    void drain();
  }

  function schedule(input: Input, delay = 0) {
    pending = { input };
    // Keep an already scheduled checkpoint from being postponed by another draft edit.
    if (delay && timer !== undefined) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  return { lookup, schedule, flush };
}
