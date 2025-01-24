import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { SelectQuery } from '../../connection/helpers/select-query';
import { CantonesDto } from './dto/cantones.dto';
import { CoreService } from '../../core.service';
import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';
import { RucDto } from './dto/ruc.dto';
import { getYear } from 'date-fns';

@Injectable()
export class GeneralService {

    constructor(private readonly dataSource: DataSourceService,
        private readonly core: CoreService) { }


    /**
     * Retorna los Periodos (years) desde que se usa el sistema, para componentes como Select, Autocomplete
     * @returns 
     */
    async getListDataPeriodos(dto?: ServiceDto) {

        const query = new SelectQuery(`
        SELECT EXTRACT(YEAR FROM fecha_emisi_cccfa) AS value, CAST(EXTRACT(YEAR FROM fecha_emisi_cccfa) AS VARCHAR) AS label  
        FROM cxc_cabece_factura 
        WHERE ide_empr = ${dto.ideEmpr}
        GROUP BY EXTRACT(YEAR FROM fecha_emisi_cccfa)
        ORDER BY 1 DESC
        `);
        const data: any[] = await this.dataSource.createSelectQuery(query);
        if (data.length === 0) {
            data.unshift({ value: getYear(new Date()), label: `${getYear(new Date())}` })
        }
        // data.unshift({ value: '', label: '' }); //Add empty select option
        return data
    }

    /**
    * Retorna las provincias
    * @returns 
    */
    async getListDataProvincias(dto?: ServiceDto) {
        const dtoIn = { ...dto, module: 'gen', tableName: 'provincia', primaryKey: 'ide_geprov', columnLabel: 'nombre_geprov' }
        return this.core.getListDataValues(dtoIn);
    }


    /**
    * Retorna los cantones de una provincia
    * @returns 
    */
    async getListDataCantones(dtoIn: CantonesDto) {

        const query = new SelectQuery(`
            select
                ide_gecant as value,
                nombre_gecan as label
            from
                gen_canton
            where
                ide_geprov = $1
            order by
                nombre_gecan
            `, dtoIn);
        query.addIntParam(1, dtoIn.ide_geprov);
        const data: any[] = await this.dataSource.createSelectQuery(query);
        // data.unshift({ value: '', label: '' }); //Add empty select option
        return data
    }


    /**
    * Retorna los titulos para una persona
    * @returns 
    */
    async getListDataTitulosPersona(dto?: ServiceDto) {
        const dtoIn = { ...dto, module: 'gen', tableName: 'titulo_persona', primaryKey: 'ide_getitp', columnLabel: "nombre_getitp || ' - ' || abreviatura_getitp" }
        return this.core.getListDataValues(dtoIn);
    }


    /**
    * Retorna los tipos de direccion
    * @returns 
    */
    async getListDataTiposDireccion(dto?: ServiceDto) {
        const dtoIn = { ...dto, module: 'gen', tableName: 'tipo_direccion', primaryKey: 'ide_getidi', columnLabel: 'nombre_getidi' }
        return this.core.getListDataValues(dtoIn);
    }


    /**
    * Valida cédula
    * @returns 
    */
    validateCedula(id: string) {
        const valid = validateCedula(id);
        const message = valid === true ? 'Cédula válida' : 'Cédula no válida';
        return {
            valid,
            message
        }
    }

    /**
    * Valida RUC
    * @returns 
    */
    validateRuc(dtoIn: RucDto) {
        const result = validateRUC(dtoIn.ruc, dtoIn.isSas);
        const message = result.isValid === true ? `${result.type} válido` : 'RUC no válido'
        return {
            valid: result.isValid,
            message
        }
    }

}
