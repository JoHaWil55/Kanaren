import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  AdvisorMessage,
  BikeRentalStation,
  CruiseStop,
  Excursion,
  PortResearchResult,
  PortWeather,
} from '../types';

interface KanarenDB extends DBSchema {
  cruiseStops: {
    key: string;
    value: CruiseStop;
  };
  savedExcursions: {
    key: string;
    value: Excursion;
  };
  cachedExcursions: {
    key: string;
    value: Excursion;
  };
  weatherCache: {
    key: string;
    value: PortWeather;
  };
  bikeRentalsCache: {
    key: string;
    value: { portId: string; fetchedAt: string; stations: BikeRentalStation[] };
  };
  portResearchCache: {
    key: string;
    value: PortResearchResult;
  };
  advisorMessages: {
    key: string;
    value: AdvisorMessage;
  };
}

let dbPromise: Promise<IDBPDatabase<KanarenDB>> | null = null;

function getDb(): Promise<IDBPDatabase<KanarenDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KanarenDB>('kanaren-entdecker-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cruiseStops')) {
          db.createObjectStore('cruiseStops', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('savedExcursions')) {
          db.createObjectStore('savedExcursions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cachedExcursions')) {
          db.createObjectStore('cachedExcursions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('weatherCache')) {
          db.createObjectStore('weatherCache', { keyPath: 'portId' });
        }
        if (!db.objectStoreNames.contains('bikeRentalsCache')) {
          db.createObjectStore('bikeRentalsCache', { keyPath: 'portId' });
        }
        if (!db.objectStoreNames.contains('portResearchCache')) {
          db.createObjectStore('portResearchCache', { keyPath: 'portId' });
        }
        if (!db.objectStoreNames.contains('advisorMessages')) {
          db.createObjectStore('advisorMessages', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export const offlineDb = {
  async loadCruiseStops(defaults: CruiseStop[]): Promise<CruiseStop[]> {
    try {
      const db = await getDb();
      const stored = await db.getAll('cruiseStops');
      if (!stored || stored.length === 0) return defaults;
      const byId: Record<string, CruiseStop> = {};
      for (const s of stored) byId[s.id] = s;
      return defaults.map((def) => byId[def.id] || def);
    } catch {
      return defaults;
    }
  },

  async saveCruiseStop(stop: CruiseStop): Promise<void> {
    try {
      const db = await getDb();
      await db.put('cruiseStops', stop);
    } catch {
      // ignore IDB write error in private mode
    }
  },

  async resetCruiseStops(defaults: CruiseStop[]): Promise<void> {
    try {
      const db = await getDb();
      const tx = db.transaction('cruiseStops', 'readwrite');
      await tx.store.clear();
      for (const stop of defaults) {
        await tx.store.put(stop);
      }
      await tx.done;
    } catch {
      // ignore
    }
  },

  async getSavedExcursions(): Promise<Excursion[]> {
    try {
      const db = await getDb();
      return await db.getAll('savedExcursions');
    } catch {
      return [];
    }
  },

  async saveExcursion(excursion: Excursion): Promise<void> {
    try {
      const db = await getDb();
      await db.put('savedExcursions', excursion);
    } catch {
      // ignore
    }
  },

  async removeSavedExcursion(excursionId: string): Promise<void> {
    try {
      const db = await getDb();
      await db.delete('savedExcursions', excursionId);
    } catch {
      // ignore
    }
  },

  async getCachedExcursions(): Promise<Excursion[]> {
    try {
      const db = await getDb();
      return await db.getAll('cachedExcursions');
    } catch {
      return [];
    }
  },

  async cacheExcursion(excursion: Excursion): Promise<void> {
    try {
      const db = await getDb();
      await db.put('cachedExcursions', excursion);
    } catch {
      // ignore
    }
  },

  async getWeather(portId: string): Promise<PortWeather | undefined> {
    try {
      const db = await getDb();
      return await db.get('weatherCache', portId);
    } catch {
      return undefined;
    }
  },

  async saveWeather(weather: PortWeather): Promise<void> {
    try {
      const db = await getDb();
      await db.put('weatherCache', weather);
    } catch {
      // ignore
    }
  },

  async getBikeRentals(portId: string): Promise<{ portId: string; fetchedAt: string; stations: BikeRentalStation[] } | undefined> {
    try {
      const db = await getDb();
      return await db.get('bikeRentalsCache', portId);
    } catch {
      return undefined;
    }
  },

  async saveBikeRentals(portId: string, stations: BikeRentalStation[]): Promise<void> {
    try {
      const db = await getDb();
      await db.put('bikeRentalsCache', {
        portId,
        fetchedAt: new Date().toISOString(),
        stations,
      });
    } catch {
      // ignore
    }
  },

  async getPortResearch(portId: string): Promise<PortResearchResult | undefined> {
    try {
      const db = await getDb();
      return await db.get('portResearchCache', portId);
    } catch {
      return undefined;
    }
  },

  async savePortResearch(research: PortResearchResult): Promise<void> {
    try {
      const db = await getDb();
      await db.put('portResearchCache', research);
    } catch {
      // ignore
    }
  },

  async getAdvisorMessages(): Promise<AdvisorMessage[]> {
    try {
      const db = await getDb();
      const all = await db.getAll('advisorMessages');
      return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    } catch {
      return [];
    }
  },

  async saveAdvisorMessage(msg: AdvisorMessage): Promise<void> {
    try {
      const db = await getDb();
      await db.put('advisorMessages', msg);
    } catch {
      // ignore
    }
  },

  async clearAdvisorMessages(): Promise<void> {
    try {
      const db = await getDb();
      await db.clear('advisorMessages');
    } catch {
      // ignore
    }
  },
};
