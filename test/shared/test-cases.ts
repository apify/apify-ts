// This is its own file to prevent circulars causing issues

import type { Constructor } from 'crawlee';
import { MemoryStorageEmulator } from './MemoryStorageEmulator';
import { SqliteStorageEmulator } from './SqliteStorageEmulator';
import type { StorageEmulator } from './StorageEmulator';

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

/**
 * A list containing just the memory storage emulator, for consistency with the `StorageTestCases`.
 * This should only be used in the event tests are flaky with both cases. Otherwise, `StorageTestCases` should be used.
 */
export const SingleStorageCase: Constructor<StorageEmulator>[] = [
    StorageTestCases[0],
];
