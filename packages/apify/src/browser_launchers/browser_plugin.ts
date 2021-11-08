export interface BrowserPlugin {
    createLaunchContext(): any;

    launch(...args: unknown[]): Promise<any>;
}
