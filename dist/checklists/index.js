"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChecklistForStrategy = getChecklistForStrategy;
exports.getLabelByKey = getLabelByKey;
const proboyChecklist_1 = require("./proboyChecklist");
const falseProboyChecklist_1 = require("./falseProboyChecklist");
const otboyChecklist_1 = require("./otboyChecklist");
const checklistMap = {
    'Пробой': proboyChecklist_1.proboyChecklist,
    'Ложный Пробой': falseProboyChecklist_1.falseProboyChecklist,
    'Отбой': otboyChecklist_1.otboyChecklist,
};
function getChecklistForStrategy(strategy) {
    return checklistMap[strategy];
}
function getLabelByKey(strategy, key) {
    const checklist = checklistMap[strategy];
    const allItems = [
        ...checklist.ПРЕДПОСЫЛКИ,
        ...checklist.МИНУСЫ,
        ...checklist.ОЖИДАЮ,
    ];
    return allItems.find((item) => item.key === key)?.label ?? key;
}
//# sourceMappingURL=index.js.map