import { z } from 'zod';

export const CreateNoteSchema = z.object({
  ticker: z
    .string()
    .min(1)
    .max(20)
    .transform((s) => s.toUpperCase()),
  marketType: z.enum(['crypto', 'stocks', 'forex']),
  strategy: z.string().min(1).max(80),
  direction: z.enum(['long', 'short']),
  entryRaw: z.number().positive(),
  customStop: z.number().positive().optional(),
  /** When set, overrides strategy default / user default risk preset */
  riskPresetId: z.number().int().positive().optional(),
  riskPercent: z.number().min(1).max(100).optional(),
  ratio: z.number().min(1).max(10).optional(),
  luftPercent: z.number().min(0).max(50).optional(),
  riskSum: z.number().positive().optional(),
  checklist: z
    .object({
      plus: z.array(z.string()),
      minus: z.array(z.string()),
      wait: z.array(z.string()),
    })
    .optional(),
  inPlay: z.boolean().default(false),
  screenshot: z.string().optional(),       // base64 image (WebP): full layout, levels on lowest TF
  /** @deprecated older extension builds; ignored — one full-layout screenshot is enough */
  screenshotFocus: z.string().optional(),
  chart: z
    .object({
      panes: z
        .array(
          z.object({
            symbol: z.string().max(60),
            interval: z.string().max(10),
            annotated: z.boolean(),
            entry: z.boolean(),
          }),
        )
        .min(1)
        .max(16),
    })
    .optional(),
  atrOverride: z.number().positive().optional(),          // ATR from TradingView label
  passRoadOverride: z.number().min(0).max(1000).optional(), // passRoad % from TradingView label
  dayOpen: z.number().positive().optional(),              // today's open from the ATR ZY indicator
});

// Same inputs as createNote, minus everything that only matters once the deal is saved
export const PreviewSetupSchema = CreateNoteSchema.omit({
  checklist: true,
  inPlay: true,
  screenshot: true,
  screenshotFocus: true,
  chart: true,
});

export const UpdateDealSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(['entered', 'closed', 'missed']),
  closePrice: z.number().positive().optional(),
  actualEntryPrice: z.number().positive().optional(), // real fill, when it differs from the planned entry
  enteredAt: z.string().datetime({ offset: true }).optional(), // fill time, when it was not just now
  dealResult: z.enum(['win', 'loss', 'breakeven']).optional(),
  screenshot: z.string().optional(), // base64 image
});

export const UploadScreenshotSchema = z.object({
  dealId:     z.number().int().positive(),
  type:       z.enum(['setup', 'entry', 'close']),
  screenshot: z.string().min(1), // base64 image
});

export type UploadScreenshotInput = z.infer<typeof UploadScreenshotSchema>;

export const GetDealsSchema = z.object({
  status: z.enum(['created', 'notified', 'entered', 'closed', 'missed']).optional(),
  strategy: z.string().min(1).max(80).optional(),
  // Positions in progress plus recent setups still waiting for an entry
  open: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AddDealCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type PreviewSetupInput = z.infer<typeof PreviewSetupSchema>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export type GetDealsInput = z.infer<typeof GetDealsSchema>;
export type AddDealCommentInput = z.infer<typeof AddDealCommentSchema>;
