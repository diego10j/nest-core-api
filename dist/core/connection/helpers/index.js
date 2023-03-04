"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataStore = exports.Query = exports.SelectQuery = exports.DeleteQuery = exports.InsertQuery = exports.UpdateQuery = void 0;
var update_query_1 = require("./update-query");
Object.defineProperty(exports, "UpdateQuery", { enumerable: true, get: function () { return update_query_1.UpdateQuery; } });
var insert_query_1 = require("./insert-query");
Object.defineProperty(exports, "InsertQuery", { enumerable: true, get: function () { return insert_query_1.InsertQuery; } });
var delete_query_1 = require("./delete-query");
Object.defineProperty(exports, "DeleteQuery", { enumerable: true, get: function () { return delete_query_1.DeleteQuery; } });
var select_query_1 = require("./select-query");
Object.defineProperty(exports, "SelectQuery", { enumerable: true, get: function () { return select_query_1.SelectQuery; } });
var query_1 = require("./query");
Object.defineProperty(exports, "Query", { enumerable: true, get: function () { return query_1.Query; } });
var data_store_1 = require("./data-store");
Object.defineProperty(exports, "DataStore", { enumerable: true, get: function () { return data_store_1.DataStore; } });
//# sourceMappingURL=index.js.map