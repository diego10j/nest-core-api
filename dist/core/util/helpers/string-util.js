"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringUtil = void 0;
class StringUtil {
    getCountStringInText(stringSearch, mainText) {
        const count = mainText.split(stringSearch).length - 1;
        if (count < 0) {
            return 0;
        }
        return count;
    }
    toTitleCase(text) {
        return text.replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
    }
}
exports.StringUtil = StringUtil;
//# sourceMappingURL=string-util.js.map