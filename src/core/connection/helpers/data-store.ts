import { Query } from './query';
import { SelectQuery } from './select-query';
import { DataSourceService } from '../datasource.service';
import { InternalServerErrorException } from '@nestjs/common';
import { InsertQuery } from './insert-query';
import { UpdateQuery } from './update-query';
import { DeleteQuery } from './delete-query';
import { Column } from '../interfaces/column';


export class DataStore {

    tableName: string;
    primaryKey: string;
    whereTable: string;
    selectColumnsTable: string;
    orderColumn: string;
    query: SelectQuery;
    data: any[];
    columns: Column[];
    isDataStoreQuery: boolean;
    listQuery: Query[]
    isAutoIncrementPK: boolean;
    index: number;

    constructor(private readonly dataSource: DataSourceService
    ) {
        this.isDataStoreQuery = false;
        this.selectColumnsTable = "*"; //all columns select
        this.query = new SelectQuery("");
        this.columns = [];
        this.data = [];
        this.listQuery = [];
        this.isAutoIncrementPK = false;
    }

    setDataStoreTable(tableName: string, primaryKey: string) {
        this.tableName = tableName.toLowerCase();
        this.primaryKey = primaryKey.toLowerCase();
        this.orderColumn = primaryKey.toLowerCase();
    }

    setWhereTable(whereTable: string) {
        this.whereTable = ' AND ' + whereTable;
    }

    setSelectColumnsTable(selectColumnsTable: string) {
        this.selectColumnsTable = selectColumnsTable.toLowerCase();
    }

    setDataStoreQuery(stringQuery: string, primaryKey: string) {
        this.query.query = stringQuery;
        this.primaryKey = primaryKey.toLowerCase();
        this.isDataStoreQuery = true;
    }

    setAutoIncrementPrimaryKey(isAutoIncrementPK: boolean) {
        this.isAutoIncrementPK = isAutoIncrementPK;
    }

    addParam(index: number, value: any) {
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
            this.index = 0; //index firs row default
        }
    }

    getSize(): number {
        return this.data.length;
    }

    isEmpty(): boolean {
        return !(this.data.length > 0);
    }

    getValue(index: number, column: string): any {
        column = column.toLowerCase();
        return this.data[index][column];
    }

    setValue(index: number, column: string, value: any) {
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



    delete(index: number) {
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
        this.index = 0; //index firs row
    }


    async save() {
        this.listQuery = [];
        if (this.isDataStoreQuery === false) {
            //INSERTADAS
            let insertedRows = this.data.filter(row => row.insert === true);
            if (insertedRows.length > 0) {
                const insertQuery = new InsertQuery(this.tableName);
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
            //MODIFICADAS
            let updatedRows = this.data.filter(row => row.update === true);
            if (updatedRows.length > 0) {
                for (let row of updatedRows) {
                    //Columnas Modificadas
                    const updateQuery = new UpdateQuery(this.tableName);
                    const colsUpdate = row.colsUpdate;
                    for (let colM of colsUpdate) {
                        updateQuery.values[colM] = row[colM];
                    }
                    updateQuery.where = `${this.primaryKey} = $1`;
                    updateQuery.addParam(1, row[this.primaryKey]);
                    this.listQuery.push(colsUpdate);
                }
            }
            //ELIMINADAS
            let deletedRows = this.data.filter(row => row.delete === true);
            for (let row of deletedRows) {
                const deleteQuery = new DeleteQuery(this.tableName);
                deleteQuery.where = `${this.primaryKey} = $1`;
                deleteQuery.addParam(1, row[this.primaryKey]);
                this.listQuery.push(deleteQuery);
            }
        }
    }


    /**
     * Retorna el indice de una columna del listado de columnas
     * @param column 
     * @returns 
     */
    getIndexColumn(column: string) {
        column = column.toLowerCase();
        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].name === column) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Retorna el indice de la fila, buscando un valor en una determinada columna
     * @param nombreColumna 
     * @param valor 
     * @returns 
     */
    getIndexRow(valor: any) {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i][this.primaryKey] === valor) {
                return i;
            }
        }
        return -1;
    }
}
