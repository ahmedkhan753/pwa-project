import { del, get, set } from 'idb-keyval';
import { StateStorage } from 'zustand/middleware';

// Custom storage engine for Zustand using IndexedDB (idb-keyval)
// This allows storing much larger state (e.g. dozens of compressed photos) 
// than the 5MB localStorage limit.
export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await get<string>(name);
    return value || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};
