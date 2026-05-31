import { z } from 'zod';
export declare const CreateNoteSchema: z.ZodObject<{
    ticker: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    marketType: z.ZodEnum<{
        crypto: "crypto";
        stocks: "stocks";
        forex: "forex";
    }>;
    strategy: z.ZodEnum<{
        Пробой: "Пробой";
        "\u041B\u043E\u0436\u043D\u044B\u0439 \u041F\u0440\u043E\u0431\u043E\u0439": "Ложный Пробой";
        Отбой: "Отбой";
    }>;
    direction: z.ZodEnum<{
        long: "long";
        short: "short";
    }>;
    entryRaw: z.ZodNumber;
    customStop: z.ZodOptional<z.ZodNumber>;
    riskPercent: z.ZodDefault<z.ZodNumber>;
    ratio: z.ZodDefault<z.ZodNumber>;
    luftPercent: z.ZodDefault<z.ZodNumber>;
    riskSum: z.ZodDefault<z.ZodNumber>;
    checklist: z.ZodOptional<z.ZodObject<{
        plus: z.ZodArray<z.ZodString>;
        minus: z.ZodArray<z.ZodString>;
        wait: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    inPlay: z.ZodDefault<z.ZodBoolean>;
    screenshot: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const UpdateDealSchema: z.ZodObject<{
    id: z.ZodNumber;
    status: z.ZodEnum<{
        entered: "entered";
        closed: "closed";
        missed: "missed";
    }>;
    closePrice: z.ZodOptional<z.ZodNumber>;
    dealResult: z.ZodOptional<z.ZodEnum<{
        win: "win";
        loss: "loss";
        breakeven: "breakeven";
    }>>;
    screenshot: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const UploadScreenshotSchema: z.ZodObject<{
    dealId: z.ZodNumber;
    type: z.ZodEnum<{
        setup: "setup";
        entry: "entry";
        close: "close";
    }>;
    screenshot: z.ZodString;
}, z.core.$strip>;
export type UploadScreenshotInput = z.infer<typeof UploadScreenshotSchema>;
export declare const GetDealsSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        entered: "entered";
        closed: "closed";
        missed: "missed";
        created: "created";
        notified: "notified";
    }>>;
    strategy: z.ZodOptional<z.ZodEnum<{
        Пробой: "Пробой";
        "\u041B\u043E\u0436\u043D\u044B\u0439 \u041F\u0440\u043E\u0431\u043E\u0439": "Ложный Пробой";
        Отбой: "Отбой";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const SendAlertSchema: z.ZodObject<{
    text: z.ZodString;
}, z.core.$strip>;
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export type GetDealsInput = z.infer<typeof GetDealsSchema>;
export type SendAlertInput = z.infer<typeof SendAlertSchema>;
