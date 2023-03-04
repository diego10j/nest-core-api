"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsertQuery = void 0;
const query_1 = require("./query");
class InsertQuery extends query_1.Query {
    constructor(table) {
        super();
        this.values = new Map();
        this.columns = [];
        this.table = table;
    }
}
exports.InsertQuery = InsertQuery;
//# sourceMappingURL=insert-query.js.map