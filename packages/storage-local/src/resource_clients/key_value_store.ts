import { stat, move, remove, readdir, createReadStream, readFile, utimes, createWriteStream, writeFile, unlink } from 'fs-extra';
import mime from 'mime-types';
import ow from 'ow';
import { join, dirname, parse, resolve } from 'path';
import stream from 'stream';
import util from 'util';
import { isStream, isBuffer } from '../utils';
import { maybeParseBody } from '../body_parser';
import { DEFAULT_API_PARAM_LIMIT } from '../consts';

const DEFAULT_LOCAL_FILE_EXTENSION = 'bin';
const COMMON_LOCAL_FILE_EXTENSIONS = ['json', 'jpeg', 'png', 'html', 'jpg', 'bin', 'txt', 'xml', 'pdf', 'mp3', 'js', 'css', 'csv'];

const streamFinished = util.promisify(stream.finished);

export interface KeyValueStoreRecord {
    key: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
    contentType?: string;
}

export interface KeyValueStoreClientOptions {
    name: string;
    storageDir: string;
}

export interface KeyValueStoreData {
    id: string;
    name: string;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
}

export interface KeyValueStoreClientUpdateOptions {
    name?: string;
}

export interface KeyValueStoreClientListOptions {
    limit?: number;
    exclusiveStartKey?: string;
}

export interface KeyValueStoreItemData {
    key: string;
    size: number;
}

export interface KeyValueStoreClientListData {
    count: number;
    limit: number;
    exclusiveStartKey?: string;
    isTruncated: boolean;
    nextExclusiveStartKey?: string;
    items: KeyValueStoreItemData[];
}

export interface KeyValueStoreClientGetRecordOptions {
    buffer?: boolean;
    stream?: boolean;
}

/**
 * Key-value Store client.
 */
export class KeyValueStoreClient {
    name: string;

    storeDir: string;

    constructor({ name, storageDir }: KeyValueStoreClientOptions) {
        this.name = name;
        this.storeDir = join(storageDir, name);
    }

    async get(): Promise<KeyValueStoreData | undefined> {
        try {
            const stats = await stat(this.storeDir);
            // The platform treats writes as access, but filesystem does not,
            // so if the modification time is more recent, use that.
            const accessedTimestamp = Math.max(stats.atimeMs, stats.mtimeMs);
            return {
                id: this.name,
                name: this.name,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                accessedAt: new Date(accessedTimestamp),
            };
        } catch (err: any) {
            if (err.code !== 'ENOENT') throw err;
        }
        return undefined;
    }

    async update(newFields: KeyValueStoreClientUpdateOptions): Promise<void> {
        // The validation is intentionally loose to prevent issues
        // when swapping to a remote storage in production.
        ow(newFields, ow.object.partialShape({
            name: ow.optional.string.minLength(1),
        }));

        if (!newFields.name) return;

        const newPath = join(dirname(this.storeDir), newFields.name);
        try {
            await move(this.storeDir, newPath);
        } catch (err: any) {
            if (/dest already exists/.test(err.message)) {
                throw new Error('Key-value store name is not unique.');
            } else if (err.code === 'ENOENT') {
                this._throw404();
            } else {
                throw err;
            }
        }
        this.name = newFields.name;
    }

    async delete(): Promise<void> {
        await remove(this.storeDir);
    }

    async listKeys(options: KeyValueStoreClientListOptions = {}): Promise<KeyValueStoreClientListData> {
        ow(options, ow.object.exactShape({
            limit: ow.optional.number.greaterThan(0),
            exclusiveStartKey: ow.optional.string,
        }));

        const {
            limit = DEFAULT_API_PARAM_LIMIT,
            exclusiveStartKey,
        } = options;

        let files!: string[];
        try {
            files = await readdir(this.storeDir);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                this._throw404();
            } else {
                throw new Error(`Error listing files in directory '${this.storeDir}'.\nCause: ${err.message}`);
            }
        }

        const items = [];
        for (const file of files) {
            try {
                const { size } = await stat(this._resolvePath(file));
                items.push({
                    key: parse(file).name,
                    size,
                });
            } catch (e: any) {
                if (e.code !== 'ENOENT') throw e;
            }
        }

        // Lexically sort to emulate API.
        items.sort((a, b) => {
            if (a.key < b.key) return -1;
            if (a.key > b.key) return 1;
            return 0;
        });

        let truncatedItems = items;
        if (exclusiveStartKey) {
            const keyPos = items.findIndex((item) => item.key === exclusiveStartKey);
            if (keyPos !== -1) truncatedItems = items.slice(keyPos + 1);
        }

        const limitedItems = truncatedItems.slice(0, limit);

        const lastItemInStore = items[items.length - 1];
        const lastSelectedItem = limitedItems[limitedItems.length - 1];
        const isLastSelectedItemAbsolutelyLast = lastItemInStore === lastSelectedItem;
        const nextExclusiveStartKey = isLastSelectedItemAbsolutelyLast
            ? undefined
            : lastSelectedItem.key;

        this._updateTimestamps();
        return {
            count: items.length,
            limit,
            exclusiveStartKey,
            isTruncated: !isLastSelectedItemAbsolutelyLast,
            nextExclusiveStartKey,
            items: limitedItems,
        };
    }

    async getRecord(key: string, options: KeyValueStoreClientGetRecordOptions = {}): Promise<KeyValueStoreRecord | undefined> {
        ow(key, ow.string);
        ow(options, ow.object.exactShape({
            buffer: ow.optional.boolean,
            stream: ow.optional.boolean,
            // This option is ignored, but kept here
            // for validation consistency with API client.
            disableRedirect: ow.optional.boolean,
        }));

        const handler = options.stream ? createReadStream : readFile;

        let result;
        try {
            result = await this._handleFile(key, handler);
            if (!result) return undefined;
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw err;
            } else {
                throw new Error(`Error reading file '${key}' in directory '${this.storeDir}'.\nCause: ${err.message}`);
            }
        }

        const record: KeyValueStoreRecord = {
            key,
            value: result.returnValue as Buffer,
            contentType: mime.contentType(result.fileName) as string,
        };

        const shouldParseBody = !(options.buffer || options.stream);
        if (shouldParseBody) {
            record.value = maybeParseBody(record.value, record.contentType!);
        }

        this._updateTimestamps();

        return record;
    }

    async setRecord(record: KeyValueStoreRecord): Promise<void> {
        ow(record, ow.object.exactShape({
            key: ow.string,
            value: ow.any(ow.null, ow.string, ow.number, ow.object),
            contentType: ow.optional.string.nonEmpty,
        }));

        const { key } = record;
        let { value, contentType } = record;

        const isValueStreamOrBuffer = isStream(value) || isBuffer(value);
        // To allow saving Objects to JSON without providing content type
        if (!contentType) {
            if (isValueStreamOrBuffer) contentType = 'application/octet-stream';
            else if (typeof value === 'string') contentType = 'text/plain; charset=utf-8';
            else contentType = 'application/json; charset=utf-8';
        }

        const extension = mime.extension(contentType) || DEFAULT_LOCAL_FILE_EXTENSION;
        const filePath = this._resolvePath(`${key}.${extension}`);

        const isContentTypeJson = extension === 'json';

        if (isContentTypeJson && !isValueStreamOrBuffer && typeof value !== 'string') {
            try {
                value = JSON.stringify(value, null, 2);
            } catch (err: any) {
                const msg = `The record value cannot be stringified to JSON. Please provide other content type.\nCause: ${err.message}`;
                throw new Error(msg);
            }
        }

        try {
            if (value instanceof stream.Readable) {
                const writeStream = value.pipe(createWriteStream(filePath));
                await streamFinished(writeStream);
            } else {
                await writeFile(filePath, value);
            }
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                this._throw404();
            } else {
                throw new Error(`Error writing file '${key}' in directory '${this.storeDir}'.\nCause: ${err.message}`);
            }
        }
        this._updateTimestamps({ mtime: true });
    }

    async deleteRecord(key: string): Promise<void> {
        ow(key, ow.string);
        try {
            const result = await this._handleFile(key, unlink);
            if (result) this._updateTimestamps({ mtime: true });
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw err;
            } else {
                throw new Error(`Error deleting file '${key}' in directory '${this.storeDir}'.\nCause: ${err.message}`);
            }
        }
    }

    /**
     * Helper function to resolve file paths.
     * @private
     */
    private _resolvePath(fileName: string) {
        return resolve(this.storeDir, fileName);
    }

    /**
     * Helper function to handle files. Accepts a promisified 'fs' function as a second parameter
     * which will be executed against the file saved under the key. Since the file's extension and thus
     * full path is not known, it first performs a check against common extensions. If no file is found,
     * it will read a full list of files in the directory and attempt to find the file again.
     *
     * Returns an object when a file is found and handler executes successfully, undefined otherwise.
     * @private
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async _handleFile(key: string, handler: (...args: any[]) => unknown | Promise<unknown>) {
        for (const extension of COMMON_LOCAL_FILE_EXTENSIONS) {
            const fileName = `${key}.${extension}`;
            const result = await this._invokeHandler(fileName, handler);
            if (result) return result;
        }

        const fileName = await this._findFileNameByKey(key);
        if (fileName) return this._invokeHandler(fileName, handler);
        return undefined;
    }

    private async _invokeHandler(fileName: string, handler: (...args: unknown[]) => unknown | Promise<unknown>) {
        try {
            const filePath = this._resolvePath(fileName);
            const returnValue = await handler(filePath);
            return { returnValue, fileName };
        } catch (err: any) {
            if (err.code !== 'ENOENT') throw err;
            return undefined;
        }
    }

    /**
     * Performs a lookup for a file in the local emulation directory's file list.
     * @private
     */
    private async _findFileNameByKey(key: string) {
        try {
            const files = await readdir(this.storeDir);
            return files.find((file) => key === parse(file).name);
        } catch (err: any) {
            if (err.code === 'ENOENT') this._throw404();
            throw err;
        }
    }

    private _throw404() {
        const err = new Error(`Key-value store with id: ${this.name} does not exist.`);
        // @ts-expect-error Adding fs-like code to the error
        err.code = 'ENOENT';
        throw err;
    }

    private _updateTimestamps({ mtime }: { mtime?: boolean } = {}) {
        // It's throwing EINVAL on Windows. Not sure why,
        // so the function is a best effort only.
        const now = new Date();
        let promise;
        if (mtime) {
            promise = utimes(this.storeDir, now, now);
        } else {
            promise = stat(this.storeDir)
                .then((stats) => utimes(this.storeDir, now, stats.mtime));
        }
        promise.catch(() => { /* we don't care that much if it sometimes fails */ });
    }
}
