import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

@Injectable()
export class FormasPagoService {
  constructor(private readonly dataSource: DataSourceService) {}

  // -------------------------------- Cabecera FORMA PAGO ---------------------------- //
  async getFormasPago(dto: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
            select 
                ide_cncfp as value,
                nombre_cncfp  as label,
                icono_cncfp as icono
            from con_cabece_forma_pago 
            where activo_cncfp = true 
            AND ide_cncfp != 3  --- no formas pago SRI
            and ide_empr = $1
            order by  nombre_cncfp
            `,
      dto,
    );
    query.addIntParam(1, dto.ideEmpr);
    const data: any[] = await this.dataSource.createSelectQuery(query);
    return data;
  }

  // -------------------------------- Detalles FORMA PAGO ---------------------------- //
  async getDetalleFormasPago(dto: IdeDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT 
            a.ide_cndfp as value,
            a.nombre_cndfp as label,
            COALESCE(b.icono_cncfp, a.icono_cndfp) AS icono
        FROM 
            con_deta_forma_pago a
        INNER JOIN 
            con_cabece_forma_pago b 
            ON a.ide_cncfp = b.ide_cncfp
        WHERE 
            activo_cndfp = TRUE 
            AND a.ide_cncfp = $1
            AND b.ide_empr = $2
        ORDER BY  
            nombre_cndfp
        `,
      dto,
    );
    query.addIntParam(1, dto.ide);
    query.addIntParam(2, dto.ideEmpr);
    const data: any[] = await this.dataSource.createSelectQuery(query);
    return data;
  }
}
