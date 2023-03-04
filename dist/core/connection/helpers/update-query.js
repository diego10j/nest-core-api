"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateQuery = void 0;
const query_1 = require("./query");
class UpdateQuery extends query_1.Query {
    constructor(table) {
        super();
        this.values = new Map();
        this.table = table;
    }
}
exports.UpdateQuery = UpdateQuery;
//# sourceMappingURL=update-query.js.map