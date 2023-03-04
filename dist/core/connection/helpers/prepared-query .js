"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreparedQuery = void 0;
const query_1 = require("./query");
class PreparedQuery extends query_1.Query {
    constructor(query) {
        super();
        this.query = query;
    }
}
exports.PreparedQuery = PreparedQuery;
//# sourceMappingURL=prepared-query%20.js.map