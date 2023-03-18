import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { ColumnsTableDto } from './connection/dto/columns-table.dto';
import { SelectQuery } from './connection/helpers/select-query';

@Injectable()
export class CoreService {


    constructor(private readonly dataSource: DataSourceService) {
    }

    /**
     * Retorna las columnas de una tabla
     * @param ColumnsTableDto 
     * @returns listado de columnas
     */
    async getColumnsTable(dto: ColumnsTableDto) {
        //Valida DTO
        await this.dataSource.util.validateDTO(ColumnsTableDto, dto);

        const pq = new SelectQuery(`SELECT 
                    lower(column_name)  as nombre, 
                    upper(column_name)  as nombreVisual, 
                    ordinal_position  as orden,
                    CASE WHEN is_nullable = 'YES' THEN false
                    ELSE true end as requerida,
                    data_type  as tipo,
                    character_maximum_lengtH as  longitud,
                    CASE WHEN numeric_scale isnull THEN 0
                    ELSE numeric_scale end as decimales,
                    'Texto' as componente,
                    true as visible,
                    false as lectura,
                    null as valorDefecto,
                    null as mascara,
                    false as filtro,
                    null as comentario,
                    false as mayuscula,
                    false as unico,
                    true as ordenable,
                    COALESCE(character_maximum_lengtH ,8)as anchoColumna,
                    CASE WHEN numeric_precision isnull THEN false 
                    ELSE true end as isNumber,
                    numeric_scale as decimales,
                    CASE WHEN datetime_precision isnull THEN false 
                    ELSE true end as isDate,
                    CASE WHEN data_type = 'boolean' THEN true 
                    ELSE false end as isBoolean
                    FROM information_schema.columns a       
                    WHERE table_name  = $1 `);

        pq.addStringParam(1, dto.tableName);
        if (dto.columns) {
            pq.query += ` AND column_name = ANY ($2)`;
            pq.addArrayStringParam(2, dto.columns);
        }
        const data = await this.dataSource.createQuery(pq);
        // Valida que retorne resultados 
        if (data.length === 0) {
            throw new BadRequestException(
                `No se encontraron resultados para la tabla: ${dto.tableName}, columnas: ${dto.columns}`
            );
        }

        if (dto.columns) {
            // Valida si se envia nombres de columnas se retorne la misma cantidad de columnas
            if (data.length != dto.columns.length) {
                throw new BadRequestException(
                    `No se encontraron todas las columnas: ${dto.columns}`
                );
            }
        }

        //borrar
        await this.dataSource.getSeqTable("sis_usuario", "ide_usua");
        /** 
        const pu = new UpdateQuery("sis_bloqueo");
        pu.values.set("maximo_bloq", 7);
        pu.where = "ide_bloq = $1 and 2=2";
        pu.addNumberParam(1, 68);        
        const r = await this.dataSource.query(pu.query, pu.paramValues);
        //console.log(pu.query);
        //console.log(pu.paramValues);
        console.log(r);
       
        const iq = new InsertQuery("sis_bloqueo");
        iq.values.set("ide_bloq", 1000)
        iq.values.set("ide_usua", 11)
        iq.values.set("tabla_bloq", "prueba")
        iq.values.set("maximo_bloq", 999)
        iq.values.set("usuario_bloq", "sa")
        const r = await this.createQuery(iq);
        console.log(iq.query);
        console.log(iq.paramValues);
        console.log(r);

        const dq = new DeleteQuery("sis_bloqueo");
        dq.where = "ide_bloq = $1 and 2=2";
        dq.addNumberParam(1, 1000);
        const r2 = await this.createQuery(dq);
        console.log(dq.query);
        console.log(dq.paramValues);
        console.log(r2);
         */
        //fin borrar

        return data;
    }


}
