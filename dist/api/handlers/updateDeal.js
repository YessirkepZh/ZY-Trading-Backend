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
exports.updateDealHandler = updateDealHandler;
const validators_1 = require("../../utils/validators");
const dealService = __importStar(require("../../services/dealService"));
const storageService = __importStar(require("../../services/storageService"));
const claudeService = __importStar(require("../../services/claudeService"));
async function updateDealHandler(request, reply) {
    const parsed = validators_1.UpdateDealSchema.safeParse(request.body);
    if (!parsed.success) {
        reply.status(400).send({ success: false, error: parsed.error.flatten() });
        return;
    }
    const { id, status, closePrice, dealResult, screenshot } = parsed.data;
    const deal = await dealService.getDealById(id);
    if (!deal) {
        reply.status(404).send({ success: false, error: `Deal #${id} not found` });
        return;
    }
    if (status === 'closed') {
        if (closePrice === undefined || dealResult === undefined) {
            reply.status(400).send({
                success: false,
                error: 'closePrice and dealResult are required when status is closed',
            });
            return;
        }
        await dealService.closeDeal(id, closePrice, dealResult);
        if (screenshot) {
            try {
                const url = await storageService.uploadScreenshot(screenshot, id, 'close');
                await dealService.setScreenshot(id, 'close', url);
            }
            catch (err) {
                console.error('Close screenshot upload failed', err);
            }
        }
        // Reload deal for Claude analysis
        const closedDeal = await dealService.getDealById(id);
        if (closedDeal) {
            try {
                const statsResult = await claudeService.analyzeClosedDeal(closedDeal);
                await dealService.setClaudeStats(id, statsResult);
            }
            catch (err) {
                // Non-fatal: log and continue
                console.error('Claude analysis failed for deal', id, err);
            }
        }
    }
    else {
        await dealService.updateDealStatus(id, status, {
            hasDeal: status === 'entered',
        });
        if (status === 'entered' && screenshot) {
            try {
                const url = await storageService.uploadScreenshot(screenshot, id, 'entry');
                await dealService.setScreenshot(id, 'entry', url);
            }
            catch (err) {
                console.error('Entry screenshot upload failed', err);
            }
        }
    }
    reply.send({ success: true, id, status });
}
//# sourceMappingURL=updateDeal.js.map