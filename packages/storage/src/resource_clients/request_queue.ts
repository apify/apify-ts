import { join, dirname } from 'path';
import ow from 'ow';
import { move, remove } from 'fs-extra';
import { AllowedHttpMethods } from '@crawlee/core/src/typedefs';
import type { DatabaseConnectionCache } from '../database_connection_cache';
import { BatchAddRequestsResult, RawQueueTableData, RequestQueueEmulator } from '../emulators/request_queue_emulator';
import { purgeNullsFromObject, uniqueKeyToRequestId } from '../utils';
import type { QueueOperationInfo } from '../emulators/queue_operation_info';

const requestShape = {
    url: ow.string,
    uniqueKey: ow.string,
    method: ow.optional.string,
    retryCount: ow.optional.number,
    handledAt: ow.optional.any(ow.string.date, ow.date),
};

export interface RequestBody {
    id?: string;
    url: string;
    uniqueKey: string;
    method?: AllowedHttpMethods;
    retryCount?: number;
    handledAt?: Date | string;
}

export interface QueueHead {
    limit: number;
    queueModifiedAt: Date;
    hadMultipleClients: boolean;
    items: unknown[];
}

export interface RequestModel {
    id?: string;
    queueId: string;
    orderNo: number | null;
    url: string;
    uniqueKey: string;
    method?: AllowedHttpMethods;
    retryCount?: number;
    handledAt?: Date | string;
    json: string;
}

export interface RequestQueueClientOptions {
    name: string;
    storageDir: string;
    dbConnections: DatabaseConnectionCache;
}

export interface ListOptions {
    /**
     * @default 100
     */
    limit?: number;
}

export interface RequestOptions {
    forefront?: boolean;
}

export class RequestQueueClient {
    // Since queues are represented by folders,
    // each DB only has one queue with ID 1.
    id = '1';

    name: string;

    dbConnections: DatabaseConnectionCache;

    queueDir: string;

    private emulator!: RequestQueueEmulator;

    constructor({ dbConnections, name, storageDir }: RequestQueueClientOptions) {
        this.name = name;
        this.dbConnections = dbConnections;
        this.queueDir = join(storageDir, name);
    }

    /**
     * API client does not make any requests immediately after
     * creation so we simulate this by creating the emulator
     * lazily. The outcome is that an attempt to access a queue
     * that does not exist throws only at the access invocation,
     * which is in line with API client.
     */
    private _getEmulator() {
        if (!this.emulator) {
            this.emulator = new RequestQueueEmulator({
                queueDir: this.queueDir,
                dbConnections: this.dbConnections,
            });
        }
        return this.emulator;
    }

    async get(): Promise<RawQueueTableData | undefined> {
        let queue;
        try {
            this._getEmulator().updateAccessedAtById(this.id);
            queue = this._getEmulator().selectById(this.id);
        } catch (err: any) {
            if (err.code !== 'ENOENT') throw err;
        }

        if (queue) {
            queue.id = queue.name;
            return purgeNullsFromObject(queue);
        }

        return undefined;
    }

    async update(newFields: { name?: string }): Promise<RawQueueTableData | undefined> {
        // The validation is intentionally loose to prevent issues
        // when swapping to a remote queue in production.
        ow(newFields, ow.object.partialShape({
            name: ow.optional.string.nonEmpty,
        }));

        if (!newFields.name) return undefined;

        const newPath = join(dirname(this.queueDir), newFields.name);

        // To prevent chaos, we close the database connection before moving the folder.
        this._getEmulator().disconnect();

        try {
            await move(this.queueDir, newPath);
        } catch (err: any) {
            if (/dest already exists/.test(err.message)) {
                throw new Error('Request queue name is not unique.');
            }
            throw err;
        }

        this.name = newFields.name;

        this._getEmulator().updateNameById(this.id, newFields.name);
        this._getEmulator().updateModifiedAtById(this.id);
        const queue = this._getEmulator().selectById(this.id);
        queue.id = queue.name;
        return purgeNullsFromObject(queue);
    }

    async delete(): Promise<void> {
        this._getEmulator().disconnect();

        await remove(this.queueDir);
    }

    async listHead(options: ListOptions = {}): Promise<QueueHead> {
        ow(options, ow.object.exactShape({
            limit: ow.optional.number,
        }));

        const {
            limit = 100,
        } = options;

        this._getEmulator().updateAccessedAtById(this.id);
        const requestJsons = this._getEmulator().selectRequestJsonsByQueueIdWithLimit(this.id, limit);
        const queueModifiedAt = new Date(this._getEmulator().selectModifiedAtById(this.id));
        return {
            limit,
            queueModifiedAt,
            hadMultipleClients: false,
            items: requestJsons.map((json) => this._jsonToRequest(json)),
        };
    }

    async addRequest(request: RequestModel, options: RequestOptions = {}): Promise<QueueOperationInfo> {
        ow(request, ow.object.partialShape({
            id: ow.undefined,
            ...requestShape,
        }));

        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
        }));

        const requestModel = this._createRequestModel(request, options.forefront);
        return this._getEmulator().addRequest(requestModel);
    }

    async batchAddRequests(requests: RequestModel[], options: RequestOptions = {}): Promise<BatchAddRequestsResult> {
        ow(requests, ow.array.ofType(ow.object.partialShape({
            id: ow.undefined,
            ...requestShape,
        })));

        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
        }));

        const requestModels = requests.map((request) => this._createRequestModel(request, options.forefront));
        return this._getEmulator().batchAddRequests(requestModels);
    }

    async getRequest(id: string): Promise<Record<string, unknown> | undefined> {
        ow(id, ow.string);
        this._getEmulator().updateAccessedAtById(this.id);
        const json = this._getEmulator().selectRequestJsonByIdAndQueueId(id, this.id);
        return this._jsonToRequest(json);
    }

    async updateRequest(request: RequestModel, options: RequestOptions = {}): Promise<QueueOperationInfo> {
        ow(request, ow.object.partialShape({
            id: ow.string,
            ...requestShape,
        }));

        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
        }));

        const requestModel = this._createRequestModel(request, options.forefront);
        return this._getEmulator().updateRequest(requestModel);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async deleteRequest(_id: string): Promise<never> {
        // TODO Deletion is done, but we also need to update request counts in a transaction.
        throw new Error('This method is not implemented in @crawlee/storage yet.');
    }

    private _createRequestModel(request: RequestBody, forefront?: boolean): RequestModel {
        const orderNo = this._calculateOrderNo(request, forefront);
        const id = uniqueKeyToRequestId(request.uniqueKey);
        if (request.id && id !== request.id) throw new Error('Request ID does not match its uniqueKey.');
        // @ts-ignore
        request.userData = { ...request.userData, __crawlee: request.internalVariables };
        // @ts-ignore
        delete request.internalVariables;

        const json = JSON.stringify({ ...request, id });
        return {
            id,
            queueId: this.id,
            orderNo,
            url: request.url,
            uniqueKey: request.uniqueKey,
            method: request.method,
            retryCount: request.retryCount,
            json,
        };
    }

    /**
     * A partial index on the requests table ensures
     * that NULL values are not returned when querying
     * for queue head.
     */
    private _calculateOrderNo(request: RequestBody, forefront?: boolean) {
        if (request.handledAt) return null;
        const timestamp = Date.now();
        return forefront ? -timestamp : timestamp;
    }

    private _jsonToRequest(requestJson: string) {
        if (!requestJson) return;
        const request = JSON.parse(requestJson);
        return purgeNullsFromObject(request);
    }
}
