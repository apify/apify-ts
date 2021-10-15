import { LruCache } from '@apify/datastructures';

/**
 * Used to manage all globally created caches, such as request queue cache
 * or dataset cache. Before creation of this class, those caches were
 * created as module scoped globals - untouchable. This proved problematic
 * especially in tests, where caches would prevent test separation.
 * @ignore
 */
export class CacheContainer {
    caches = new Map<string, LruCache>();

    openCache(name: string, maxSize: number): LruCache {
        let cache = this.caches.get(name);
        if (!cache) {
            cache = new LruCache({ maxLength: maxSize });
            this.caches.set(name, cache);
        }
        return cache;
    }

    getCache(name: string): LruCache | undefined {
        return this.caches.get(name);
    }

    clearCache(name: string) {
        const cache = this.caches.get(name);
        cache.clear();
    }

    clearAllCaches() {
        this.caches.forEach((cache) => cache.clear());
    }
}

export default new CacheContainer();
