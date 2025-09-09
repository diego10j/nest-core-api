import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';


import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';


@Injectable()
export class EmpresaRepService {
    constructor(
        private readonly dataSource: DataSourceService,
    ) { }

    async getEmpresaById(ideEmpr: number): Promise<Empresa> {
        const query = new SelectQuery(`
          select
              ide_empr,
              nom_empr,
              identificacion_empr,
              nom_corto_empr,
              mail_empr,
              logotipo_empr,
              direccion_empr,
              pagina_empr,
              telefono_empr
          from
              sis_empresa
          where
              ide_empr = $1
              `);
        query.addParam(1, ideEmpr);
        const res = await this.dataSource.createSingleQuery(query);
        if (res === null) {
            throw new BadRequestException(`La empresa no existe`);
        }
        return res;
    }
}
