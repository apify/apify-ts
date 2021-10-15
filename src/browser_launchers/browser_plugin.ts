export abstract class BrowserPlugin {
    constructor(
        readonly launcher: unknown,
        readonly context: Record<string, unknown>,
    ) { }

    async createLaunchContext(): Promise<any> {
        // ...
    }

    async launch(_context: Record<string, unknown>): Promise<any> {
        // ...
    }
}
