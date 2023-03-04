"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreparedUpdate = void 0;
const query_1 = require("./query");
class PreparedUpdate extends query_1.Query {
    constructor(table) {
        super();
        this.values = new Map();
        this.table = table;
    }
}
exports.PreparedUpdate = PreparedUpdate;
//# sourceMappingURL=prepared-update.js.map