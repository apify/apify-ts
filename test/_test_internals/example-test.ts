// @ts-nocheck
import { StorageEmulator, StorageTestCases } from './StorageEmulator';

test.each(StorageTestCases)('TestName with %s', (Emulator) => {
    const emulator = new Emulator();

    beforeEach(async () => {
        await emulator.init();
    });

    afterAll(async () => {
        await emulator.destroy();
    });
});
