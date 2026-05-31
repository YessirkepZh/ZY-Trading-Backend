"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNoteHandler = createNoteHandler;
const validators_1 = require("../../utils/validators");
const marketDataService = __importStar(require("../../services/marketDataService"));
const calculationService = __importStar(require("../../services/calculationService"));
const claudeService = __importStar(require("../../services/claudeService"));
const dealService = __importStar(require("../../services/dealService"));
const storageService = __importStar(require("../../services/storageService"));
const telegramService = __importStar(require("../../services/telegramService"));
const keyboards_1 = require("../../bot/keyboards");
async function createNoteHandler(request, reply) {
    const parsed = validators_1.CreateNoteSchema.safeParse(request.body);
    if (!parsed.success) {
        reply.status(400).send({ success: false, error: parsed.error.flatten() });
        return;
    }
    const input = parsed.data;
    const { ticker, marketType, strategy, direction, entryRaw, customStop, riskPercent, ratio, luftPercent, riskSum, checklist, screenshot, } = input;
    // Deduplication check
    const isDuplicate = await dealService.checkDuplicate(ticker, entryRaw, direction);
    if (isDuplicate) {
        reply.status(409).send({
            success: false,
            error: 'Duplicate: same setup created within the last 30 seconds',
        });
        return;
    }
    // 1. Market data
    const { bars } = await marketDataService.getMarketData(ticker, marketType);
    // 2. Calculate ATR + TP/SL/Qty
    const calcResult = calculationService.calculateDeal({
        direction,
        entryRaw,
        riskPercent,
        ratio,
        luftPercent,
        riskSum,
        customStop,
        bars,
    });
    // 3. Save deal to DB
    const payload = {
        ticker, marketType, strategy, direction, entryRaw,
        customStop, riskPercent, ratio, luftPercent, riskSum,
        checklist,
    };
    const id = await dealService.createDeal(payload, calcResult);
    // Upload setup screenshot if provided (non-fatal)
    if (screenshot) {
        try {
            const screenshotUrl = await storageService.uploadScreenshot(screenshot, id, 'setup');
            await dealService.setScreenshot(id, 'setup', screenshotUrl);
        }
        catch (err) {
            request.log.warn({ err }, 'Screenshot upload failed (non-fatal)');
        }
    }
    // 4. Claude check
    const ohlcvSummary = marketDataService.formatOhlcvSummary(bars);
    const claudeCheck = await claudeService.checkSetup({
        ticker,
        marketType,
        strategy,
        direction,
        calcResult,
        checklist: checklist ?? { plus: [], minus: [], wait: [] },
        ohlcvSummary,
    });
    // 5. Save Claude result
    await dealService.setClaudeCheck(id, claudeCheck);
    // 6. Update status
    await dealService.updateDealStatus(id, 'notified');
    // 7. Send Telegram notification (non-fatal — bot may be unavailable)
    try {
        const deal = await dealService.getDealById(id);
        if (deal) {
            const keyboard = (0, keyboards_1.getDealActionKeyboard)(id);
            await telegramService.sendScenario(deal, calcResult, claudeCheck, checklist, keyboard);
        }
    }
    catch (telegramErr) {
        request.log.warn({ err: telegramErr }, 'Telegram notification failed (non-fatal)');
    }
    // 8. Return response
    reply.send({ success: true, id, calcResult, claudeCheck });
}
//# sourceMappingURL=createNote.js.map