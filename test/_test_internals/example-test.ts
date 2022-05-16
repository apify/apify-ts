// @ts-nocheck
import { StorageTestCases } from './StorageEmulator';

describe.each(StorageTestCases)('TestName with %s', (Emulator) => {
    const emulator = new Emulator();

    beforeEach(async () => {
        await emulator.init();
    });

    afterAll(async () => {
        await emulator.destroy();
    });
});
