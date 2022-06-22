import { KeyValueStore } from '@crawlee/core';

// Augment the key value store with the Apify specific methods.
// @ts-expect-error We cannot augment this in the monorepo, so we do it in a post build script
KeyValueStore.prototype.getPublicUrl = function (this: KeyValueStore, key: string) {
    return `https://api.apify.com/v2/key-value-stores/${this.id}/records/${key}`;
};
