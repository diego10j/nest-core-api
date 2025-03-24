import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { OrderByDto } from 'src/common/dto/order-by.dto';
import { ServiceDto } from 'src/common/dto/service.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';

@Injectable()
export class PuntoVentaService extends BaseService {


    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        // this.dataSource.getVariables([
        //     'p_cxc_estado_factura_normal', // 0
        //     'p_con_tipo_documento_factura', // 3
        // ]).then(result => {
        //     this.variables = result;
        // });
    }

    /**
     * Retorna los estados de las ordenes del punto de venta, no filtra empresa
     * @param dto 
     * @returns 
     */
    async getTableQueryEstadosOrden(dto: ServiceDto) {
        const dtoIn = {
            ...dto,
            module: 'cxc',
            tableName: 'estado_orden',
            primaryKey: 'ide_ccesor',
            orderBy: { column: 'nombre_ccesor', direction: 'ASC' } as OrderByDto
        }
        return this.core.getTableQuery(dtoIn);
    }




}