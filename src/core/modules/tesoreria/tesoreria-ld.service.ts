import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

@Injectable()
export class TesoreriaLdService {
    constructor(private readonly dataSource: DataSourceService) { }

    /**
     * Retorna todos los tipos de transacción bancaria (ingreso y egreso)
     * como { value, label }
     */
    async getListDataTiposTranBanc(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(
            `
      SELECT
        CAST(ide_tettb AS VARCHAR) AS value,
        nombre_tettb              AS label
      FROM tes_tip_tran_banc
      WHERE ide_empr = $1
      ORDER BY nombre_tettb
      `,
        );
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna solo los tipos de transacción bancaria de INGRESO (signo_tettb = 1)
     * como { value, label }
     */
    async getListDataTiposTranBancIngreso(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(
            `
      SELECT
        CAST(ide_tettb AS VARCHAR) AS value,
        nombre_tettb              AS label
      FROM tes_tip_tran_banc
      WHERE signo_tettb = 1
        AND ide_empr = $1
      ORDER BY nombre_tettb
      `,
        );
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna solo los tipos de transacción bancaria de EGRESO (signo_tettb = -1)
     * como { value, label }
     */
    async getListDataTiposTranBancEgreso(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(
            `
      SELECT
        CAST(ide_tettb AS VARCHAR) AS value,
        nombre_tettb              AS label
      FROM tes_tip_tran_banc
      WHERE signo_tettb = -1
        AND ide_empr = $1
      ORDER BY nombre_tettb
      `,
        );
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }
}
