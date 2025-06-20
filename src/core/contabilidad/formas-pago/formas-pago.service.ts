import { Injectable } from '@nestjs/common';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';

import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SelectQuery } from 'src/core/connection/helpers';

@Injectable()
export class FormasPagoService {

    constructor(private readonly dataSource: DataSourceService,
        private readonly core: CoreService) { }


    // -------------------------------- DET FORMA PAGO ---------------------------- //
    async getFormasPago(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        select a.ide_cndfp,a.nombre_cndfp,b.nombre_cncfp,icono_cncfp from con_deta_forma_pago a
        inner join con_cabece_forma_pago b on a.ide_cncfp=b.ide_cncfp
        where activo_cndfp = true 
        AND activo_cncfp = true 
        AND a.ide_cncfp != 3
        and b.ide_empr = $1
        order by  nombre_cncfp,nombre_cndfp, dias_cndfp
        `, dto);
        query.addIntParam(1, dto.ideEmpr);
        const data: any[] = await this.dataSource.createSelectQuery(query);
        return data
    }



}
