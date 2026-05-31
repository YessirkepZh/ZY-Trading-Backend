"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendAlertSchema = exports.GetDealsSchema = exports.UploadScreenshotSchema = exports.UpdateDealSchema = exports.CreateNoteSchema = void 0;
const zod_1 = require("zod");
exports.CreateNoteSchema = zod_1.z.object({
    ticker: zod_1.z
        .string()
        .min(1)
        .max(20)
        .transform((s) => s.toUpperCase()),
    marketType: zod_1.z.enum(['crypto', 'stocks', 'forex']),
    strategy: zod_1.z.enum(['Пробой', 'Ложный Пробой', 'Отбой']),
    direction: zod_1.z.enum(['long', 'short']),
    entryRaw: zod_1.z.number().positive(),
    customStop: zod_1.z.number().positive().optional(),
    riskPercent: zod_1.z.number().min(1).max(100).default(15),
    ratio: zod_1.z.number().min(1).max(10).default(3),
    luftPercent: zod_1.z.number().min(0).max(50).default(20),
    riskSum: zod_1.z.number().positive().default(15),
    checklist: zod_1.z
        .object({
        plus: zod_1.z.array(zod_1.z.string()),
        minus: zod_1.z.array(zod_1.z.string()),
        wait: zod_1.z.array(zod_1.z.string()),
    })
        .optional(),
    inPlay: zod_1.z.boolean().default(false),
    screenshot: zod_1.z.string().optional(), // base64 PNG from Extension
});
exports.UpdateDealSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive(),
    status: zod_1.z.enum(['entered', 'closed', 'missed']),
    closePrice: zod_1.z.number().positive().optional(),
    dealResult: zod_1.z.enum(['win', 'loss', 'breakeven']).optional(),
    screenshot: zod_1.z.string().optional(), // base64 PNG
});
exports.UploadScreenshotSchema = zod_1.z.object({
    dealId: zod_1.z.number().int().positive(),
    type: zod_1.z.enum(['setup', 'entry', 'close']),
    screenshot: zod_1.z.string().min(1), // base64 PNG
});
exports.GetDealsSchema = zod_1.z.object({
    status: zod_1.z.enum(['created', 'notified', 'entered', 'closed', 'missed']).optional(),
    strategy: zod_1.z.enum(['Пробой', 'Ложный Пробой', 'Отбой']).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
exports.SendAlertSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
});
//# sourceMappingURL=validators.js.map