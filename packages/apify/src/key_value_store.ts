import { KeyValueStore } from '@crawlee/core';

// Augment the key value store with the Apify specific methods.
KeyValueStore.prototype.getPublicUrl = function (this: KeyValueStore, key: string) {
    return `https://api.apify.com/v2/key-value-stores/${this.id}/records/${key}`;
};

declare module '@crawlee/core' {
    interface KeyValueStore {
        getPublicUrl(key: string): string;
    }
}
