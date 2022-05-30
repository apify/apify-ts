declare module 'fingerprint-generator' {
    class FingerprintGenerator {
        constructor(options?: Record<string, any>)
        getFingerprint(options?: Record<string, any>): { fingerprint: import('fingerprint-injector').Fingerprint };
    }
    export = FingerprintGenerator
}
