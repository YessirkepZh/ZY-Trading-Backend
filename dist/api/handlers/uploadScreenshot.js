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
exports.uploadScreenshotHandler = uploadScreenshotHandler;
const validators_1 = require("../../utils/validators");
const storageService = __importStar(require("../../services/storageService"));
const dealService = __importStar(require("../../services/dealService"));
async function uploadScreenshotHandler(request, reply) {
    const parsed = validators_1.UploadScreenshotSchema.safeParse(request.body);
    if (!parsed.success) {
        reply.status(400).send({ success: false, error: parsed.error.flatten() });
        return;
    }
    const { dealId, type, screenshot } = parsed.data;
    const deal = await dealService.getDealById(dealId);
    if (!deal) {
        reply.status(404).send({ success: false, error: `Deal #${dealId} not found` });
        return;
    }
    const url = await storageService.uploadScreenshot(screenshot, dealId, type);
    await dealService.setScreenshot(dealId, type, url);
    reply.send({ success: true, url });
}
//# sourceMappingURL=uploadScreenshot.js.map