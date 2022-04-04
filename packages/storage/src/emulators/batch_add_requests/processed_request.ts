import { QueueOperationInfo } from '../queue_operation_info';

export class ProcessedRequest extends QueueOperationInfo {
    constructor(requestId: string, public uniqueKey: string, requestOrderNo?: number | null) {
        super(requestId, requestOrderNo);
    }
}
