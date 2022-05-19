import { handleMessage, WorkerDirectoryMap } from './worker-utils';

export class FileStorageWorkerEmulator {
    constructor(readonly directoryMap: WorkerDirectoryMap) {}

    postMessage(value: any): void {
        void handleMessage(this.directoryMap, value);
    }
}
