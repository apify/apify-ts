import { move, remove, stat, readdirSync, readFile, utimes, writeFile } from 'fs-extra';
import ow from 'ow';
import { join, dirname, parse } from 'path';
import type { DatasetCollectionData } from './dataset_collection';

/**
 * This is what API returns in the x-apify-pagination-limit
 * header when no limit query parameter is used.
 */
const LIST_ITEMS_LIMIT = 999_999_999_999;

/**
 * Number of characters of the dataset item file names.
 * E.g.: 000000019.json - 9 digits
 */
const LOCAL_FILENAME_DIGITS = 9;

export interface DatasetClientOptions {
    name: string;
    storageDir: string;
}

export interface Dataset extends DatasetCollectionData {
    itemCount: number;
}

type DataTypes = string | string[] | Record<string, unknown> | Record<string, unknown>[];

export interface DatasetClientUpdateOptions {
    name?: string;
}

export interface DatasetClientListOptions {
    desc?: boolean;
    limit?: number;
    offset?: number;
}

export interface PaginationList {
    items?: Record<string, unknown>[];
    total: number;
    offset: number;
    count: number;
    limit?: number;
}

export class DatasetClient {
    name: string;

    storeDir: string;

    itemCount?: number = undefined;

    constructor({ name, storageDir } : DatasetClientOptions) {
        this.name = name;
        this.storeDir = join(storageDir, name);
    }

    async get(): Promise<Dataset | undefined> {
        try {
            this._ensureItemCount();
            const stats = await stat(this.storeDir);
            // The platform treats writes as access, but filesystem does not,
            // so if the modification time is more recent, use that.
            const accessedTimestamp = Math.max(stats.mtime.getTime(), stats.atime.getTime());
            return {
                id: this.name,
                name: this.name,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                accessedAt: new Date(accessedTimestamp),
                itemCount: this.itemCount!,
            };
        } catch (err: any) {
            if (err.code !== 'ENOENT') throw err;
            return undefined;
        }
    }

    async update(newFields: DatasetClientUpdateOptions): Promise<void> {
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
                throw new Error('Dataset name is not unique.');
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

        this.itemCount = undefined;
    }

    async downloadItems(): Promise<never> {
        throw new Error('This method is not implemented in @apify/storage-local yet.');
    }

    async listItems(options: DatasetClientListOptions = {}): Promise<PaginationList> {
        this._ensureItemCount();
        // The extra code is to enable a custom validation message.
        ow(options, ow.object.validate((value) => ({
            validator: ow.isValid(value, ow.object.exactShape({
                // clean: ow.optional.boolean,
                desc: ow.optional.boolean,
                // fields: ow.optional.array.ofType(ow.string),
                // omit: ow.optional.array.ofType(ow.string),
                limit: ow.optional.number,
                offset: ow.optional.number,
                // skipEmpty: ow.optional.boolean,
                // skipHidden: ow.optional.boolean,
                // unwind: ow.optional.string,
            })),
            message: 'Local dataset emulation supports only the "desc", "limit" and "offset" options.',
        })));

        const {
            limit = LIST_ITEMS_LIMIT,
            offset = 0,
            desc,
        } = options;

        const [start, end] = this._getStartAndEndIndexes(offset, limit);
        const items = [];
        for (let idx = start; idx < end; idx++) {
            const item = await this._readAndParseFile(idx);
            items.push(item);
        }

        this._updateTimestamps();
        return {
            items: desc ? items.reverse() : items,
            total: this.itemCount!,
            offset,
            count: items.length,
            limit,
        };
    }

    async pushItems(items: DataTypes): Promise<void> {
        this._ensureItemCount();
        ow(items, ow.any(
            ow.object,
            ow.string,
            ow.array.ofType(ow.any(ow.object, ow.string)),
        ));

        items = this._normalizeItems(items);
        const promises = items.map((item) => {
            this.itemCount!++;

            // We normalized the items to objects and now stringify them back to JSON,
            // because we needed to inspect the contents of the strings. They could
            // be JSON arrays which we need to split into individual items.
            const finalItem = JSON.stringify(item, null, 2);
            const filePath = join(this.storeDir, this._getItemFileName(this.itemCount!));

            return writeFile(filePath, finalItem);
        });

        await Promise.all(promises);
        this._updateTimestamps({ mtime: true });
    }

    /**
     * To emulate API and split arrays of items into individual dataset items,
     * we need to normalize the input items - which can be strings, objects
     * or arrays of those - into objects, so that we can save them one by one
     * later. We could potentially do this directly with strings, but let's
     * not optimize prematurely.
     */
    private _normalizeItems(items: DataTypes): Record<string, unknown>[] {
        if (typeof items === 'string') {
            items = JSON.parse(items);
        }

        return Array.isArray(items)
            ? items.map(this._normalizeItem)
            : [this._normalizeItem(items)];
    }

    private _normalizeItem(item: string | Record<string, unknown>) {
        if (typeof item === 'string') {
            item = JSON.parse(item) as Record<string, unknown>;
        }

        if (Array.isArray(item)) {
            throw new Error(`Each dataset item can only be a single JSON object, not an array. Received: [${item.join(',\n')}]`);
        }

        return item;
    }

    private _ensureItemCount() {
        if (typeof this.itemCount === 'number') return;

        let files: string[];
        try {
            files = readdirSync(this.storeDir);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                this._throw404();
            } else {
                throw err;
            }
        }

        if (files.length) {
            const lastFile = files.pop()!;
            const lastFileName = parse(lastFile).name;
            this.itemCount = Number(lastFileName);
        } else {
            this.itemCount = 0;
        }
    }

    private _getItemFileName(index: number) {
        const name = index.toString().padStart(LOCAL_FILENAME_DIGITS, '0');
        return `${name}.json`;
    }

    private _getStartAndEndIndexes(offset: number, limit = this.itemCount!) {
        const start = offset + 1;
        const end = Math.min(offset + limit, this.itemCount!) + 1;
        return [start, end] as const;
    }

    private async _readAndParseFile(index: number): Promise<Record<string, unknown>> {
        const filePath = join(this.storeDir, this._getItemFileName(index));

        const json = await readFile(filePath, 'utf8');
        return JSON.parse(json);
    }

    private _throw404(): never {
        const err = new Error(`Dataset with id: ${this.name} does not exist.`);
        // TODO: cast as ErrorWithCode once #21 lands
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
