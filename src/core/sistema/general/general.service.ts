import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { SelectQuery } from '../../connection/helpers/select-query';

@Injectable()
export class GeneralService {

    constructor(private readonly dataSource: DataSourceService) { }


    /**
     * Retorna los Periodos (years) desde que se usa el sistema, para componentes como Select, Autocomplete
     * @returns 
     */
    async getListDataPeriodos(_dtoIn?: ServiceDto) {

        const query = new SelectQuery(`
        SELECT EXTRACT(YEAR FROM fecha_emisi_cccfa) AS value, CAST(EXTRACT(YEAR FROM fecha_emisi_cccfa) AS VARCHAR) AS label  
        FROM cxc_cabece_factura 
        WHERE ide_empr = 0 
        GROUP BY EXTRACT(YEAR FROM fecha_emisi_cccfa)
        ORDER BY 1 DESC
        `);
        const data: any[] = await this.dataSource.createSelectQuery(query);
        // data.unshift({ value: '', label: '' }); //Add empty select option
        return data
    }

}
