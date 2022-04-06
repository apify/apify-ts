export class UnprocessedRequest {
    // eslint-disable-next-line no-useless-constructor
    constructor(public uniqueKey: string, public url: string, public method?: string) {}
}
