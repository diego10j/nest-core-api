"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectQuery = void 0;
const query_1 = require("./query");
class SelectQuery extends query_1.Query {
    constructor(query) {
        super();
        this.query = query;
    }
    setPaginator(rows) {
        this.rows = rows;
        this.offset = 0;
        this.page = 1;
    }
}
exports.SelectQuery = SelectQuery;
//# sourceMappingURL=select-query.js.map