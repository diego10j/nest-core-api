import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { OrderByDto } from 'src/common/dto/order-by.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { CoreService } from 'src/core/core.service';

@Injectable()
export class PuntoVentaService extends BaseService {
  constructor(private readonly core: CoreService) {
    super();
  }

  /**
   * Retorna los estados de las ordenes del punto de venta, no filtra empresa
   * @param dto
   * @returns
   */
  async getTableQueryEstadosOrden(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'cxc',
      tableName: 'estado_orden',
      primaryKey: 'ide_ccesor',
      orderBy: { column: 'nombre_ccesor', direction: 'ASC' } as OrderByDto,
    };
    return this.core.getTableQuery(dtoIn);
  }
}
