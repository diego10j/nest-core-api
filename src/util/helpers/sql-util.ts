import { InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { UpdateQuery, InsertQuery, DeleteQuery, SelectQuery } from 'src/core/connection/helpers';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { QueryOptionsDto } from '../../common/dto/query-options.dto';

/**
 * Retorna la sentencia SQL del objeto UpdateQuery
 * @param query  UpdateQuery
 * @returns 
 */
export function getSqlUpdate(query: UpdateQuery) {
    query.query = `UPDATE ${query.table} SET `;
    let sqlSetValues = "";
    let cont = query.params.length;
    for (let [key, value] of query.values) {
        // Verifica si el valor es un objeto, si es así lo serializamos a JSON
        if (value !== null && typeof value === 'object') {
            value = JSON.stringify(value);
        }
        sqlSetValues = sqlSetValues !== "" ? sqlSetValues + "," : sqlSetValues;
        cont++;
        sqlSetValues += `${key} = $${cont}`;
        query.params.push({ index: cont, value })
    }
    if (query.where) {
        query.where = `WHERE 1=1 AND ${query.where}`;
    } else {
        throw new InternalServerErrorException(
            `[ERROR]: No existen condiciones en el UPDATE`
        );
    }
    query.query += `${sqlSetValues} ${query.where} `;
    return query;
}


/**
 * Retorna la sentencia SQL del objeto InsertQuery
 * @param query  InsertQuery
 * @returns 
 */
export function getSqlInsert(query: InsertQuery) {
    query.query = `INSERT INTO ${query.table} ( `;
    let sqlColumns = "";
    let sqlValues = "";
    let cont = query.params.length;
    //Si nos se definieron las columnas se obtiene de los values
    query.columns = query.columns.length === 0 ? Array.from(query.values.keys()) : query.columns;
    for (let [key, value] of query.values) {
        if (query.columns.indexOf(key) > -1) {
            sqlColumns = sqlColumns !== "" ? sqlColumns + "," : sqlColumns;
            sqlValues = sqlValues !== "" ? sqlValues + "," : sqlValues;
            cont++;
            sqlColumns += `${key}`;

            // Verifica si el valor es un objeto, lo serializamos
            if (value !== null && typeof value === 'object') {
                value = JSON.stringify(value);
            }

            sqlValues += `$${cont}`;
            query.params.push({ index: cont, value });
        }
        // Campos de auditoría
    }
    query.query += `${sqlColumns} ) VALUES ( ${sqlValues} )`;
    return query;
}


/**
 * Retorna la sentencia SQL del objeto DeleteQuery
 * @param query  DeleteQuery
 * @returns 
 */
export function getSqlDelete(query: DeleteQuery) {
    query.query = `DELETE FROM ${query.table} `;
    if (query.where) {
        query.where = `WHERE 1=1 AND ${query.where}`;
    } else {
        throw new InternalServerErrorException(
            `[ERROR]: No existen condiciones en el DELETE`
        );
    }
    query.query += query.where;
    return query;
}

/**
 * Retorna la sentencia SQL del objeto SelectQuery
 * @param query  SelectQuery
 * @returns 
 */
export function getSqlSelect(query: SelectQuery) {
    if ((query.pagination)) {
        const { pagination } = query;
        query.query += ` OFFSET ${pagination.offset} LIMIT ${pagination.pageSize}`;
    }
    return query;
}

export function getTypeCoreColumn(nameType: string) {
    // https://github.com/brianc/node-pg-types/blob/master/lib/builtins.js
    // Diccionario para mapear tipos
    const typeMap: { [key: string]: string } = {
        'VARCHAR': 'String',
        'TEXT': 'String',
        'CHAR': 'String',
        'XML': 'String',
        'JSON': 'String',
        'UUID': 'String',
        'FLOAT4': 'Number',
        'FLOAT8': 'Number',
        'MONEY': 'Number',
        'NUMERIC': 'Number',
        'INT8': 'Number',
        'INT2': 'Number',
        'INT4': 'Number',
        'DATE': 'Date',
        'TIME': 'Time',
        'TIMETZ': 'Time',
        'TIMESTAMP': 'DateTime',
        'TIMESTAMPTZ': 'DateTime',
        'BOOL': 'Boolean',
        'BIT': 'Boolean'
    };

    // Devolver el tipo mapeado o 'String' por defecto
    return typeMap[nameType] || 'String';
}


export function getDefaultValueColumn(nameType: string) {
    // Diccionario para mapear tipos
    const defaultValues: { [key: string]: any } = {
        'VARCHAR': "",
        'TEXT': "",
        'CHAR': "",
        'XML': "",
        'JSON': "",
        'UUID': "",
        'FLOAT4': null,
        'FLOAT8': null,
        'MONEY': null,
        'NUMERIC': null,
        'INT8': null,
        'INT2': null,
        'INT4': null,
        'DATE': null,
        'TIME': null,
        'TIMETZ': null,
        'TIMESTAMP': null,
        'TIMESTAMPTZ': null,
        'BOOL': false,
        'BIT': false
    };

    // Devolver el valor por defecto mapeado o null por defecto
    return defaultValues[nameType] || null;
}

export function getComponentColumn(nameType: string) {
    // Diccionario para mapear tipos de datos a componentes
    const componentMap: { [key: string]: string } = {
        'VARCHAR': "Text",
        'TEXT': "Text",
        'CHAR': "Text",
        'XML': "Text",
        'JSON': "Text",
        'UUID': "Text",
        'FLOAT4': "Text",
        'FLOAT8': "Text",
        'MONEY': "Text",
        'NUMERIC': "Text",
        'INT8': "Text",
        'INT2': "Text",
        'INT4': "Text",
        'DATE': "Calendar",
        'TIME': "Time",
        'TIMETZ': "Time",
        'TIMESTAMP': "CalendarTime",
        'TIMESTAMPTZ': "CalendarTime",
        'BOOL': "Checkbox",
        'BIT': "Checkbox"
    };

    // Devolver el componente correspondiente o "Text" por defecto
    return componentMap[nameType] || "Text";

}

export function getVisibleCoreColumn(nameColumn: string) {
    const hiddenColumns = ['ide_empr', 'ide_sucu', 'fecha_actua', 'hora_actua', 'usuario_actua', 'fecha_ingre', 'hora_ingre', 'usuario_ingre', 'uuid'];
    if (hiddenColumns.includes(nameColumn)) return false
    return true;
}

export function getAlignCoreColumn(nameType: string) {
    // Diccionario para mapear tipos de datos a alineaciones
    const alignmentMap: { [key: string]: string } = {
        'String': "left",
        'Date': "left",
        'Time': "left",
        'DateTime': "left",
        'Number': "right",
        'Integer': "right",
        'Boolean': "center"
    };

    // Devolver la alineación correspondiente o "left" por defecto
    return alignmentMap[nameType] || "left";
}

export function getTypeFilterColumn(nameType: string) {
    // Diccionario para mapear tipos de datos filtrofn
    const filerMap: { [key: string]: string } = {
        'String': "arrIncludesSome",
        'Date': "arrIncludesSome",
        'Time': "arrIncludesSome",
        'DateTime': "arrIncludesSome",
        'Number': "numberFilterFn",
        'Integer': "numberFilterFn",
        'Boolean': "booleanFilterFn"
    };

    return filerMap[nameType] || "arrIncludesSome";
}

export function getSizeCoreColumn(nameType: string, length: number): number {
    const minSize = ['Date', 'Time', 'Boolean'];
    const medSize = ['DateTime', 'Number', 'Integer'];
    if (minSize.includes(nameType)) return 110;
    if (medSize.includes(nameType)) return 120;
    if (length > 0 && length < 20) return 150;
    if (length >= 20 && length < 30) return 190;
    if (length >= 30 && length < 50) return 230;
    if (length >= 50 && length < 70) return 270;
    if (length >= 70 && length < 90) return 300;
    if (length >= 90 && length < 100) return 240;
    if (length >= 100 && length < 150) return 380;
    if (length >= 150 && length < 180) return 420;
    if (length >= 180 && length < 200) return 460;
    if (length >= 200) return 500;
    return 200;
}

/**
 * Remplaza vacios por null, undefinded por null
 * @param value 
 * @returns 
 */
export function toObjectTable(value: object): object {
    const cloneObjUpdate: any = { ...value };
    Object.keys(value).forEach(key => {
        if (cloneObjUpdate[key] === '') cloneObjUpdate[key] = null;
        if (cloneObjUpdate[key] === undefined) cloneObjUpdate[key] = null;
    });
    return cloneObjUpdate;
}

export function getWhereIdeSucu(tabla: string, dto: QueryOptionsDto & HeaderParamsDto) {
    return ` AND ${tabla}.ide_sucu = ${dto.ideSucu}`;
}

export function getWhereIdeEmpr(tabla: string, dto: QueryOptionsDto & HeaderParamsDto) {
    return ` AND ${tabla}.ide_empr = ${dto.ideEmpr}`;
}

export function toStringColumns(columns: string[]): string {
    return columns.map(col => `${col}`).join(', ');
}

// Método para normalizar strings (quitar tildes y caracteres especiales)
export function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Elimina diacríticos
        .replace(/[^a-z0-9]/g, "");     // Elimina todo lo que no sea alfanumérico
}
