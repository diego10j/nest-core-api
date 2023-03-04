"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteQuery = void 0;
const query_1 = require("./query");
class DeleteQuery extends query_1.Query {
    constructor(table) {
        super();
        this.table = table;
    }
}
exports.DeleteQuery = DeleteQuery;
//# sourceMappingURL=delete-query.js.map