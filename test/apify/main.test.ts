import { ENV_VARS, KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { Configuration, KeyValueStore } from '@crawlers/core';
import { Actor } from 'apify';
import { LocalStorageDirEmulator } from './local_storage_dir_emulator';

describe('Apify functions for storages', () => {
    let localStorageEmulator: LocalStorageDirEmulator;

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Configuration.getGlobalConfig().set('localStorageDir', storageDir);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    describe('Apify.getInput', () => {
        test('should work', async () => {
            const defaultStore = await KeyValueStore.open();
            // Uses default value.
            const oldGet = defaultStore.getValue;
            // @ts-expect-error TODO use spyOn instead of this
            defaultStore.getValue = async (key) => expect(key).toEqual(KEY_VALUE_STORE_KEYS.INPUT);
            await Actor.getInput();

            // Uses value from env var.
            process.env[ENV_VARS.INPUT_KEY] = 'some-value';
            // @ts-expect-error TODO use spyOn instead of this
            defaultStore.getValue = async (key) => expect(key).toBe('some-value');
            await Actor.getInput();

            delete process.env[ENV_VARS.INPUT_KEY];

            defaultStore.getValue = oldGet;
        });
    });

    describe('Apify.setValue', () => {
        test('should work', async () => {
            const record = { foo: 'bar' };
            const defaultStore = await KeyValueStore.open();

            const oldSet = defaultStore.setValue;
            defaultStore.setValue = async (key, value) => {
                expect(key).toBe('key-1');
                expect(value).toBe(record);
            };

            await Actor.setValue('key-1', record);

            defaultStore.setValue = oldSet;
        });
    });

    describe('Apify.getValue', () => {
        test('should work', async () => {
            const defaultStore = await KeyValueStore.open();

            const oldGet = defaultStore.getValue;
            // @ts-expect-error TODO use spyOn instead of this
            defaultStore.getValue = async (key) => expect(key).toBe('key-1');

            await Actor.getValue('key-1');

            defaultStore.getValue = oldGet;
        });
    });

    describe('Apify.pushData', () => {
        test('should work', async () => {
            const defaultStore = await KeyValueStore.open();

            const oldGet = defaultStore.getValue;
            // @ts-expect-error TODO use spyOn instead of this
            defaultStore.getValue = async (key) => expect(key).toBe('key-1');

            await Actor.getValue('key-1');

            defaultStore.getValue = oldGet;
        });
    });
});
