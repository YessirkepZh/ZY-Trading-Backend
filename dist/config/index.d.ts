export declare const config: {
    readonly port: number;
    readonly nodeEnv: string;
    readonly telegram: {
        readonly token: string;
        readonly allowedUsers: number[];
    };
    readonly bybit: {
        readonly apiKey: string;
        readonly apiSecret: string;
    };
    readonly polygon: {
        readonly apiKey: string;
    };
    readonly anthropic: {
        readonly apiKey: string;
        readonly model: "claude-opus-4-5";
    };
    readonly db: {
        readonly connectionString: string;
    };
    readonly risk: {
        readonly cryptoDefault: number;
        readonly luftPercent: number;
        readonly ratio: number;
        readonly riskSum: number;
    };
};
