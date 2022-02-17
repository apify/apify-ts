export class QueueOperationInfo {
    wasAlreadyPresent: boolean;

    wasAlreadyHandled: boolean;

    constructor(public requestId: string, requestOrderNo?: number | null) {
        this.wasAlreadyPresent = requestOrderNo !== undefined;
        this.wasAlreadyHandled = requestOrderNo === null;
    }
}
