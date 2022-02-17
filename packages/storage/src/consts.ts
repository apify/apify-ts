/**
 * Length of id property of a Request instance in characters.
 */
export const REQUEST_ID_LENGTH = 15;

/**
 * SQL that produces a timestamp in the correct format.
 */
export const TIMESTAMP_SQL = "STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'NOW')";

/**
 * Types of all emulated storages (currently used for warning messages only).
 */
export const enum STORAGE_TYPES {
    REQUEST_QUEUE = 'Request queue',
    KEY_VALUE_STORE = 'Key-value store',
    DATASET = 'Dataset',
};

/**
 * Names of all emulated storages.
 */
export const enum STORAGE_NAMES {
    REQUEST_QUEUES = 'request_queues',
    KEY_VALUE_STORES = 'key_value_stores',
    DATASETS = 'datasets',
};

/**
 * Name of the request queue master database file.
 */
export const DATABASE_FILE_NAME = 'db.sqlite';

/**
 * To enable high performance WAL mode, SQLite creates 2 more
 * files for performance optimizations.
 */
export const DATABASE_FILE_SUFFIXES = ['-shm', '-wal'];

/**
 * Except in dataset items, the default limit for API results is 1000.
 */
export const DEFAULT_API_PARAM_LIMIT = 1000;
