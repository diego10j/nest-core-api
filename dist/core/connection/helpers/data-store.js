"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataStore = void 0;
const select_query_1 = require("./select-query");
const insert_query_1 = require("./insert-query");
const update_query_1 = require("./update-query");
const delete_query_1 = require("./delete-query");
class DataStore {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.isDataStoreQuery = false;
        this.selectColumnsTable = "*";
        this.query = new select_query_1.SelectQuery("");
        this.columns = [];
        this.data = [];
        this.listQuery = [];
        this.isAutoIncrementPK = false;
    }
    setDataStoreTable(tableName, primaryKey) {
        this.tableName = tableName.toLowerCase();
        this.primaryKey = primaryKey.toLowerCase();
        this.orderColumn = primaryKey.toLowerCase();
    }
    setWhereTable(whereTable) {
        this.whereTable = ' AND ' + whereTable;
    }
    setSelectColumnsTable(selectColumnsTable) {
        this.selectColumnsTable = selectColumnsTable.toLowerCase();
    }
    setDataStoreQuery(stringQuery, primaryKey) {
        this.query.query = stringQuery;
        this.primaryKey = primaryKey.toLowerCase();
        this.isDataStoreQuery = true;
    }
    setAutoIncrementPrimaryKey(isAutoIncrementPK) {
        this.isAutoIncrementPK = isAutoIncrementPK;
    }
    addParam(index, value) {
        this.query.params.push({ index, value });
    }
    async execute() {
        if (this.isDataStoreQuery === false) {
            this.query.query = `SELECT ${this.selectColumnsTable} FROM ${this.tableName} WHERE 1=1 ${this.whereTable} ORDER BY ${this.orderColumn}`;
        }
        const res = await this.dataSource.createQueryPG(this.query);
        this.data = res.data;
        this.columns = res.columns;
        if (this.data.length > 0) {
            this.index = 0;
        }
    }
    getSize() {
        return this.data.length;
    }
    isEmpty() {
        return !(this.data.length > 0);
    }
    getValue(index, column) {
        column = column.toLowerCase();
        return this.data[index][column];
    }
    setValue(index, column, value) {
        this.data[index][column] = value;
        if (this.isDataStoreQuery === false) {
            if (!this.dataSource.util.isDefined(this.data[index]['insert'])) {
                this.data[index]['update'] = true;
                let colsUpdate = [];
                if (this.dataSource.util.isDefined(this.data[index]['colsUpdate'])) {
                    colsUpdate = this.data[index]['colsUpdate'];
                }
                colsUpdate.indexOf(column) === -1 ? colsUpdate.push(column) : colsUpdate;
                this.data[index]['colsUpdate'] = colsUpdate;
            }
        }
    }
    delete(index) {
        if (!this.dataSource.util.isDefined(this.data[index]['insert'])) {
            this.data[index]['delete'] = true;
        }
    }
    insert() {
        let row = {};
        for (const col of this.columns) {
            row[col.name] = null;
        }
        row['insert'] = true;
        this.data.unshift(row);
        this.index = 0;
    }
    async save() {
        this.listQuery = [];
        if (this.isDataStoreQuery === false) {
            let insertedRows = this.data.filter(row => row.insert === true);
            if (insertedRows.length > 0) {
                const insertQuery = new insert_query_1.InsertQuery(this.tableName);
                let seqTable = 1;
                if (!this.isAutoIncrementPK) {
                    seqTable = await this.dataSource.getSeqTable(this.tableName, this.primaryKey, insertedRows.length);
                }
                for (let row of insertedRows) {
                    if (!this.isAutoIncrementPK) {
                        row[this.primaryKey] = seqTable;
                    }
                    insertQuery.values = new Map(Object.entries(row));
                    insertQuery.columns = this.columns.map(_col => _col.name);
                    this.listQuery.push(insertQuery);
                    seqTable++;
                }
            }
            let updatedRows = this.data.filter(row => row.update === true);
            if (updatedRows.length > 0) {
                for (let row of updatedRows) {
                    const updateQuery = new update_query_1.UpdateQuery(this.tableName);
                    const colsUpdate = row.colsUpdate;
                    for (let colM of colsUpdate) {
                        updateQuery.values[colM] = row[colM];
                    }
                    updateQuery.where = `${this.primaryKey} = $1`;
                    updateQuery.addParam(1, row[this.primaryKey]);
                    this.listQuery.push(colsUpdate);
                }
            }
            let deletedRows = this.data.filter(row => row.delete === true);
            for (let row of deletedRows) {
                const deleteQuery = new delete_query_1.DeleteQuery(this.tableName);
                deleteQuery.where = `${this.primaryKey} = $1`;
                deleteQuery.addParam(1, row[this.primaryKey]);
                this.listQuery.push(deleteQuery);
            }
        }
    }
    getIndexColumn(column) {
        column = column.toLowerCase();
        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].name === column) {
                return i;
            }
        }
        return -1;
    }
    getIndexRow(valor) {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i][this.primaryKey] === valor) {
                return i;
            }
        }
        return -1;
    }
}
exports.DataStore = DataStore;
//# sourceMappingURL=data-store.js.map