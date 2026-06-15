"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatClaudeRecommendationRu = formatClaudeRecommendationRu;
exports.formatClaudeReasoningRu = formatClaudeReasoningRu;
const RECOMMENDATION_RU = {
    take: 'Входить',
    skip: 'Пропустить',
    wait: 'Ждать',
};
function formatClaudeRecommendationRu(recommendation) {
    return RECOMMENDATION_RU[recommendation];
}
function formatClaudeReasoningRu(claudeCheck) {
    return claudeCheck.reasoningRu ?? claudeCheck.reasoning;
}
//# sourceMappingURL=claudeDisplay.js.map