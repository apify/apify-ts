// This is its own file to prevent circulars causing issues

import { Constructor } from 'crawlee';
import { MemoryStorageEmulator } from './MemoryStorageEmulator';
import { SqliteStorageEmulator } from './SqliteStorageEmulator';
import { StorageEmulator } from './StorageEmulator';

/**
 * A list of StorageEmulators that should be used for tests that depend on storage.
 *
 * USAGE:
 *
 * Start your test with a `test.each(StorageTestCases, (Emulator) => {});`
 * Inside the test case, create and initialize the Emulator in the beforeAll hook,
 * call `clean()` in afterEach hook and finally call `destroy()` in afterAll hook.
 *
 * You can see an example in ./example-test.ts
 */
export const StorageTestCases: Constructor<StorageEmulator>[] = [
    MemoryStorageEmulator,
    SqliteStorageEmulator,
];