declare module 'fpscanner' {
	export function analyseFingerprint(fingerprint: Fingerprint): FingerprintResult;

	export type FingerprintResults = Record<keyof typeof TESTS, FingerprintResult>;

	export interface FingerprintResult {
		name: keyof typeof TESTS;
		consistent: INCONSISTENT | UNSURE | CONSISTENT;
		data: unknown;
	}

	export const INCONSISTENT: 1;
	export const UNSURE: 2;
	export const CONSISTENT: 3;

	export const TESTS: {
        PHANTOM_UA: 'PHANTOM_UA',
        PHANTOM_PROPERTIES: 'PHANTOM_PROPERTIES',
        PHANTOM_ETSL: 'PHANTOM_ETSL',
        PHANTOM_LANGUAGE: 'PHANTOM_LANGUAGE',
        PHANTOM_WEBSOCKET: 'PHANTOM_WEBSOCKET',
        MQ_SCREEN: 'MQ_SCREEN',
        PHANTOM_OVERFLOW: 'PHANTOM_OVERFLOW',
        PHANTOM_WINDOW_HEIGHT: 'PHANTOM_WINDOW_HEIGHT',
        HEADCHR_UA: 'HEADCHR_UA',
        WEBDRIVER: 'WEBDRIVER',
        HEADCHR_CHROME_OBJ: 'HEADCHR_CHROME_OBJ',
        HEADCHR_PERMISSIONS: 'HEADCHR_PERMISSIONS',
        HEADCHR_PLUGINS: 'HEADCHR_PLUGINS',
        HEADCHR_IFRAME: 'HEADCHR_IFRAME',
        CHR_DEBUG_TOOLS: 'CHR_DEBUG_TOOLS',
        SELENIUM_DRIVER: 'SELENIUM_DRIVER',
        CHR_BATTERY: 'CHR_BATTERY',
        CHR_MEMORY: 'CHR_MEMORY',
        TRANSPARENT_PIXEL: 'TRANSPARENT_PIXEL',
        SEQUENTUM: 'SEQUENTUM',
        VIDEO_CODECS: 'VIDEO_CODECS'
    };

	export interface Fingerprint {
		plugins: string[];
		mimeTypes: string[];
		userAgent: string;
		platform: string | 'unknown';
		languages: string[] | 'unknown';
		screen: FingerprintScreen;
		touchScreen: [maxTouchPoints: number, touchEvent: boolean, touchStart: boolean];
		videoCard: string[] | string;
		multimediaDevices: {
			devicesBlockedByBrave: boolean
		} | {
			speakers: number;
			micros: number;
			webcams: number;
		};
		productSub: string;
		navigatorPrototype: string[];
		etsl: number;
		screenDesc: string | 'error';
		nightmareJS: boolean;
		phantomJS: [callPhantom: boolean, _phantom: boolean, phantom: boolean];
		selenium: [
			webdriver: boolean,
			_Selenium_IDE_Recorder: boolean,
            callSelenium: boolean,
            _selenium: boolean,
            __webdriver_script_fn: boolean,
            __driver_evaluate: boolean,
            __webdriver_evaluate: boolean,
            __selenium_evaluate: boolean,
            __fxdriver_evaluate: boolean,
            __driver_unwrapped: boolean,
            __webdriver_unwrapped: boolean,
            __selenium_unwrapped: boolean,
            __fxdriver_unwrapped: boolean,
            __webdriver_script_func: boolean,
            selenium: boolean,
            webdriver: boolean,
            driver: boolean
		];
		webDriver: boolean;
		webDriverValue: boolean;
		errorsGenerated: string[];
		resOverflow: {
			depth: number;
			errorMessage: string;
			errorName: string;
			errorStacklength: number;
		};
		accelerometerUsed: boolean;
		screenMediaQuery: boolean;
		hasChrome: boolean;
		detailChrome: Record<'webstore' | 'runtime' | 'app' | 'csi' | 'loadTimes' | 'properties' | 'connect' | 'sendMessage', number> | 'unknown';
		permissions: { state: unknown, permission: unknown };
		iframeChrome: string;
		debugTool: boolean;
		battery: boolean;
		deviceMemory: number;
		tpCanvas: Uint8ClampedArray | 'error';
		sequentum: boolean;
		audioCodecs: {
			ogg: boolean | 'unknown';
			mp3: boolean | 'unknown';
			wav: boolean | 'unknown';
			m4a: boolean | 'unknown';
			aac: boolean | 'unknown';
		};
		videoCodecs: {
			ogg: boolean | 'unknown';
			h264: boolean | 'unknown';
			webm: boolean | 'unknown';
		};
	}

	export interface FingerprintScreen {
		wInnerHeight: number;
		wOuterHeight: number;
		wOuterWidth: number;
		wInnerWidth: number;
		wScreenX: number;
		wPageXOffset: number;
		wPageYOffset: number;
		cWidth: number;
		cHeight: number;
		sWidth: number;
		sHeight: number;
		sAvailWidth: number;
		sAvailHeight: number;
		sColorDepth: number;
		sPixelDepth: number;
		wDevicePixelRatio: number;
	}
}
