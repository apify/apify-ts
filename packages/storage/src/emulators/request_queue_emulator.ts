import { join, parse } from 'path';
import type { Database, Statement, Transaction, RunResult } from 'better-sqlite3-with-prebuilds';
import { QueueOperationInfo } from './queue_operation_info';
import { STORAGE_NAMES, TIMESTAMP_SQL, DATABASE_FILE_NAME } from '../consts';
import type { DatabaseConnectionCache } from '../database_connection_cache';
import type { RequestModel } from '../resource_clients/request_queue';

const ERROR_REQUEST_NOT_UNIQUE = 'SQLITE_CONSTRAINT_PRIMARYKEY';
const ERROR_QUEUE_DOES_NOT_EXIST = 'SQLITE_CONSTRAINT_FOREIGNKEY';

export interface RequestQueueEmulatorOptions {
    queueDir: string;
    dbConnections: DatabaseConnectionCache;
}

interface ErrorWithCode extends Error {
    code: string;
}

export interface RawQueueTableData {
    id: string;
    name: string;
    createdAt: string;
    modifiedAt: string;
    accessedAt: string;
    totalRequestCount: number;
    handledRequestCount: number;
    pendingRequestCount: number;
}

export interface RawRequestsTableData {
    queueId: string;
    id: string;
    orderNo: number;
    url: string;
    uniqueKey: string;
    method?: string | null;
    retryCount: number;
    json: string;
}

export class RequestQueueEmulator {
    dbPath: string;

    dbConnections: DatabaseConnectionCache;

    db: Database;

    queueTableName = STORAGE_NAMES.REQUEST_QUEUES;

    requestsTableName = `${STORAGE_NAMES.REQUEST_QUEUES}_requests`;

    private _selectById!: Statement;

    private _deleteById!: Statement;

    private _selectByName!: Statement;

    private _selectModifiedAtById!: Statement;

    private _insertByName!: Statement;

    private _updateNameById!: Statement;

    private _updateModifiedAtById!: Statement;

    private _updateAccessedAtById!: Statement;

    private _adjustTotalAndHandledRequestCounts!: Statement;

    private _selectRequestOrderNoByModel!: Statement;

    private _selectRequestJsonByModel!: Statement;

    private _selectRequestJsonsByQueueIdWithLimit!: Statement;

    private _insertRequestByModel!: Statement;

    private _updateRequestByModel!: Statement;

    private _deleteRequestById!: Statement;

    private _selectOrInsertTransaction!: Transaction;

    private _addRequestTransaction!: Transaction;

    private _updateRequestTransaction!: Transaction;

    private _deleteRequestTransaction!: Transaction;

    constructor({ queueDir, dbConnections }: RequestQueueEmulatorOptions) {
        this.dbPath = join(queueDir, DATABASE_FILE_NAME);
        this.dbConnections = dbConnections;

        try {
            this.db = dbConnections.openConnection(this.dbPath);
        } catch (err: any) {
            if (err.code !== 'ENOENT') throw err;
            const newError = new Error(`Request queue with id: ${parse(queueDir).name} does not exist.`) as ErrorWithCode;
            newError.code = 'ENOENT';
            throw newError;
        }

        // Everything's covered by IF NOT EXISTS so no need
        // to worry that multiple entities will be created.
        this._createTables();
        this._createTriggers();
        this._createIndexes();
    }

    /**
     * Disconnects the emulator from the underlying database.
     */
    disconnect(): void {
        this.dbConnections.closeConnection(this.dbPath);
    }

    selectById(id: string | number): RawQueueTableData {
        if (!this._selectById) {
            this._selectById = this.db.prepare(`
                SELECT *, CAST(id as TEXT) as id
                FROM ${this.queueTableName}
                WHERE id = ?
            `);
        }
        return this._selectById.get(id);
    }

    deleteById(id: string): RunResult {
        if (!this._deleteById) {
            this._deleteById = this.db.prepare(`
                DELETE FROM ${this.queueTableName}
                WHERE id = CAST(? as INTEGER)
            `);
        }
        return this._deleteById.run(id);
    }

    selectByName(name: string): RawQueueTableData {
        if (!this._selectByName) {
            this._selectByName = this.db.prepare(`
                SELECT *, CAST(id as TEXT) as id
                FROM ${this.queueTableName}
                WHERE name = ?
            `);
        }
        return this._selectByName.get(name);
    }

    insertByName(name: string): RunResult {
        if (!this._insertByName) {
            this._insertByName = this.db.prepare(`
                INSERT INTO ${this.queueTableName}(name)
                VALUES(?)
            `);
        }
        return this._insertByName.run(name);
    }

    selectOrInsertByName(name: string): RawQueueTableData {
        if (!this._selectOrInsertTransaction) {
            this._selectOrInsertTransaction = this.db.transaction((n) => {
                if (n) {
                    const storage = this.selectByName(n);
                    if (storage) return storage;
                }

                const { lastInsertRowid } = this.insertByName(n);
                return this.selectById(lastInsertRowid.toString());
            });
        }
        return this._selectOrInsertTransaction(name);
    }

    selectModifiedAtById(id: string | number): string {
        if (!this._selectModifiedAtById) {
            this._selectModifiedAtById = this.db.prepare(`
                SELECT modifiedAt FROM ${this.queueTableName}
                WHERE id = ?
            `).pluck();
        }
        return this._selectModifiedAtById.get(id);
    }

    updateNameById(id: string | number, name: string): RunResult {
        if (!this._updateNameById) {
            this._updateNameById = this.db.prepare(`
                UPDATE ${this.queueTableName}
                SET name = :name
                WHERE id = CAST(:id as INTEGER)
            `);
        }
        return this._updateNameById.run({ id, name });
    }

    updateModifiedAtById(id: string | number): RunResult {
        if (!this._updateModifiedAtById) {
            this._updateModifiedAtById = this.db.prepare(`
                UPDATE ${this.queueTableName}
                SET modifiedAt = ${TIMESTAMP_SQL}
                WHERE id = CAST(? as INTEGER)
            `);
        }
        return this._updateModifiedAtById.run(id);
    }

    updateAccessedAtById(id: string | number): RunResult {
        if (!this._updateAccessedAtById) {
            this._updateAccessedAtById = this.db.prepare(`
                UPDATE ${this.queueTableName}
                SET accessedAt = ${TIMESTAMP_SQL}
                WHERE id = CAST(? as INTEGER)
            `);
        }
        return this._updateAccessedAtById.run(id);
    }

    adjustTotalAndHandledRequestCounts(id: string, totalAdjustment: number, handledAdjustment: number): RunResult {
        if (!this._adjustTotalAndHandledRequestCounts) {
            this._adjustTotalAndHandledRequestCounts = this.db.prepare(`
                UPDATE ${this.queueTableName}
                SET totalRequestCount = totalRequestCount + :totalAdjustment,
                    handledRequestCount = handledRequestCount + :handledAdjustment
                WHERE id = CAST(:id as INTEGER)
            `);
        }
        return this._adjustTotalAndHandledRequestCounts.run({
            id,
            totalAdjustment,
            handledAdjustment,
        });
    }

    selectRequestOrderNoByModel(requestModel: RequestModel): number | null {
        if (!this._selectRequestOrderNoByModel) {
            this._selectRequestOrderNoByModel = this.db.prepare(`
                SELECT orderNo FROM ${this.requestsTableName}
                WHERE queueId = CAST(:queueId as INTEGER) AND id = :id
            `).pluck();
        }
        return this._selectRequestOrderNoByModel.get(requestModel);
    }

    selectRequestJsonByIdAndQueueId(requestId: string, queueId: string): string {
        if (!this._selectRequestJsonByModel) {
            this._selectRequestJsonByModel = this.db.prepare(`
                SELECT json FROM ${this.requestsTableName}
                WHERE queueId = CAST(? as INTEGER) AND id = ?
            `).pluck();
        }
        return this._selectRequestJsonByModel.get(queueId, requestId);
    }

    selectRequestJsonsByQueueIdWithLimit(queueId: string, limit: number): string[] {
        if (!this._selectRequestJsonsByQueueIdWithLimit) {
            this._selectRequestJsonsByQueueIdWithLimit = this.db.prepare(`
                SELECT json FROM ${this.requestsTableName}
                WHERE queueId = CAST(? as INTEGER) AND orderNo IS NOT NULL
                LIMIT ?
            `).pluck();
        }
        return this._selectRequestJsonsByQueueIdWithLimit.all(queueId, limit);
    }

    insertRequestByModel(requestModel: RequestModel): RunResult {
        if (!this._insertRequestByModel) {
            this._insertRequestByModel = this.db.prepare(`
                INSERT INTO ${this.requestsTableName}(
                    id, queueId, orderNo, url, uniqueKey, method, retryCount, json
                ) VALUES (
                    :id, CAST(:queueId as INTEGER), :orderNo, :url, :uniqueKey, :method, :retryCount, :json
                )
            `);
        }
        return this._insertRequestByModel.run(requestModel);
    }

    updateRequestByModel(requestModel: RequestModel): RunResult {
        if (!this._updateRequestByModel) {
            this._updateRequestByModel = this.db.prepare(`
                UPDATE ${this.requestsTableName}
                SET orderNo = :orderNo,
                    url = :url,
                    uniqueKey = :uniqueKey,
                    method = :method,
                    retryCount = :retryCount,
                    json = :json
                WHERE queueId = CAST(:queueId as INTEGER) AND id = :id
            `);
        }
        return this._updateRequestByModel.run(requestModel);
    }

    deleteRequestById(id: string): RunResult {
        if (!this._deleteRequestById) {
            this._deleteRequestById = this.db.prepare(`
                DELETE FROM ${this.requestsTableName}
                WHERE id = ?
            `);
        }
        return this._deleteRequestById.run(id);
    }

    addRequest(requestModel: RequestModel): QueueOperationInfo {
        if (!this._addRequestTransaction) {
            this._addRequestTransaction = this.db.transaction((model) => {
                try {
                    this.insertRequestByModel(model);
                    const handledCountAdjustment = model.orderNo === null ? 1 : 0;
                    this.adjustTotalAndHandledRequestCounts(model.queueId, 1, handledCountAdjustment);
                    // We return wasAlreadyHandled: false even though the request may
                    // have been added as handled, because that's how API behaves.
                    return new QueueOperationInfo(model.id);
                } catch (err: any) {
                    if (err.code === ERROR_REQUEST_NOT_UNIQUE) {
                        // If we got here it means that the request was already present.
                        // We need to figure out if it were handled too.
                        const orderNo = this.selectRequestOrderNoByModel(model);
                        return new QueueOperationInfo(model.id, orderNo);
                    }
                    if (err.code === ERROR_QUEUE_DOES_NOT_EXIST) {
                        throw new Error(`Request queue with id: ${model.queueId} does not exist.`);
                    }
                    throw err;
                }
            });
        }
        return this._addRequestTransaction(requestModel);
    }

    updateRequest(requestModel: RequestModel): QueueOperationInfo {
        if (!this._updateRequestTransaction) {
            this._updateRequestTransaction = this.db.transaction((model) => {
                // First we need to check the existing request to be
                // able to return information about its handled state.
                const orderNo = this.selectRequestOrderNoByModel(model);

                // Undefined means that the request is not present in the queue.
                // We need to insert it, to behave the same as API.
                if (orderNo === undefined) {
                    return this.addRequest(model);
                }

                // When updating the request, we need to make sure that
                // the handled counts are updated correctly in all cases.
                this.updateRequestByModel(model);
                let handledCountAdjustment = 0;
                const isRequestHandledStateChanging = typeof orderNo !== typeof model.orderNo;
                const requestWasHandledBeforeUpdate = orderNo === null;

                if (isRequestHandledStateChanging) handledCountAdjustment += 1;
                if (requestWasHandledBeforeUpdate) handledCountAdjustment = -handledCountAdjustment;
                this.adjustTotalAndHandledRequestCounts(model.queueId, 0, handledCountAdjustment);

                // Again, it's important to return the state of the previous
                // request, not the new one, because that's how API does it.
                return new QueueOperationInfo(model.id, orderNo);
            });
        }
        return this._updateRequestTransaction(requestModel);
    }

    deleteRequest(id: string): unknown {
        if (!this._deleteRequestTransaction) {
            this._deleteRequestTransaction = this.db.transaction(() => {
                // TODO
            });
        }
        return this._deleteRequestTransaction(id);
    }

    private _createTables() {
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS ${this.queueTableName}(
                id INTEGER PRIMARY KEY,
                name TEXT UNIQUE,
                createdAt TEXT DEFAULT(${TIMESTAMP_SQL}),
                modifiedAt TEXT DEFAULT(${TIMESTAMP_SQL}),
                accessedAt TEXT DEFAULT(${TIMESTAMP_SQL}),
                totalRequestCount INTEGER DEFAULT 0,
                handledRequestCount INTEGER DEFAULT 0,
                pendingRequestCount INTEGER GENERATED ALWAYS AS (totalRequestCount - handledRequestCount) VIRTUAL
            )
        `).run();
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS ${this.requestsTableName}(
                queueId INTEGER NOT NULL REFERENCES ${this.queueTableName}(id) ON DELETE CASCADE,
                id TEXT NOT NULL,
                orderNo INTEGER,
                url TEXT NOT NULL,
                uniqueKey TEXT NOT NULL,
                method TEXT,
                retryCount INTEGER,
                json TEXT NOT NULL,
                PRIMARY KEY (queueId, id, uniqueKey)
            )
        `).run();
    }

    private _createTriggers() {
        const getSqlForRequests = (cmd: 'INSERT' | 'UPDATE' | 'DELETE') => `
        CREATE TRIGGER IF NOT EXISTS T_bump_modifiedAt_accessedAt_on_${cmd.toLowerCase()}
                AFTER ${cmd} ON ${this.requestsTableName}
            BEGIN
                UPDATE ${this.queueTableName}
                SET modifiedAt = ${TIMESTAMP_SQL},
                    accessedAt = ${TIMESTAMP_SQL}
                WHERE id = ${cmd === 'DELETE' ? 'OLD' : 'NEW'}.queueId;
            END
        `;

        (['INSERT', 'UPDATE', 'DELETE'] as const).forEach((cmd) => {
            const sql = getSqlForRequests(cmd);
            this.db.exec(sql);
        });
    }

    private _createIndexes() {
        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS I_queueId_orderNo
            ON ${this.requestsTableName}(queueId, orderNo)
            WHERE orderNo IS NOT NULL
        `).run();
    }
}
