"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Query = void 0;
class Query {
    constructor() {
        this.params = [];
    }
    addIntParam(index, value) {
        this.params.push({ index: index, value: parseInt(value.toString()) });
    }
    addNumberParam(index, value) {
        this.params.push({ index, value });
    }
    addStringParam(index, value) {
        this.params.push({ index, value });
    }
    addBooleanParam(index, value) {
        this.params.push({ index, value });
    }
    addArrayStringParam(index, value) {
        this.params.push({ index, value });
    }
    addArrayNumberParam(index, value) {
        this.params.push({ index, value });
    }
    addParam(index, value) {
        this.params.push({ index, value });
    }
    get paramValues() {
        return this.params.map(p => p.value);
        ;
    }
}
exports.Query = Query;
//# sourceMappingURL=query.js.map