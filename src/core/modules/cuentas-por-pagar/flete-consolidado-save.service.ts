import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { CrearFacturaFleteConsolidadaDto } from './dto/crear-factura-flete-consolidada.dto';
import { MarcarPagadoFleteConsolidadoDto } from './dto/id-flete-consolidado.dto';

/** Estados de cxp_estado_flete_cons (seed en script-cxp-flete-consolidado.sql). */
const ESTADO_PENDIENTE_PAGO = 1;
const ESTADO_PAGADO = 2;
const ESTADO_ANULADO = 3;

/**
 * Guardado del flujo "Factura Consolidada de Flete": crea la factura CxP (reusando
 * DocumentosCxPSaveService.saveDocumento tal cual, sin tocar ese código), vincula los N
 * envíos y registra la tabla de control (cxp_cab_flete_cons/cxp_det_flete_cons). El registro
 * del pago en sí reusa RegistrarPagoCxPDialog/CxpTransaccionesSaveService.savePagoCxP sin
 * cambios - aquí solo se marca la tabla de control como pagada tras ese guardado.
 */
@Injectable()
export class FleteConsolidadoSaveService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly documentosCxPSaveService: DocumentosCxPSaveService,
    ) { }

    async crearFacturaFleteConsolidada(dtoIn: CrearFacturaFleteConsolidadaDto & HeaderParamsDto) {
        if (dtoIn.envios.length < 2) {
            throw new BadRequestException('Debe incluir al menos 2 envíos para una factura consolidada.');
        }
        const ideCctfaSet = new Set(dtoIn.envios.map((e) => e.ide_cctfa));
        if (ideCctfaSet.size !== dtoIn.envios.length) {
            throw new BadRequestException('Hay envíos repetidos en el emparejamiento.');
        }

        // 1. Factura CxP + cuenta por pagar: mismo mecanismo que el flujo de un solo envío
        // (sin ide_cctfa, así que saveDocumento no intenta vincular ningún envío por su cuenta).
        const resultado = await this.documentosCxPSaveService.saveDocumento({
            ...dtoIn,
            cabecera: dtoIn.cabecera,
            detalles: dtoIn.detalles,
            isUpdate: false,
        });
        const ideCpcfa = resultado.ide_cpcfa;
        const detallesIdeCpdfa = resultado.detalles_ide_cpdfa;
        if (!detallesIdeCpdfa || detallesIdeCpdfa.length !== dtoIn.detalles.length) {
            throw new InternalServerErrorException(
                'No se pudo determinar el ide_cpdfa de las líneas creadas para la factura consolidada.',
            );
        }

        // 2. Vincular los N envíos + tabla de control, en su propia transacción.
        const ideCpcfc = await this.dataSource.getSeqTable('cxp_cab_flete_cons', 'ide_cpcfc', 1, dtoIn.login);
        const baseIdeCpdfc = await this.dataSource.getSeqTable(
            'cxp_det_flete_cons', 'ide_cpdfc', dtoIn.envios.length, dtoIn.login,
        );

        const listQuery: Query[] = [];

        const cabQuery = new InsertQuery('cxp_cab_flete_cons', 'ide_cpcfc', dtoIn);
        cabQuery.values.set('ide_cpcfc', ideCpcfc);
        cabQuery.values.set('ide_cpefc', ESTADO_PENDIENTE_PAGO);
        cabQuery.values.set('ide_geper', dtoIn.cabecera.ide_geper);
        cabQuery.values.set('ide_cpcfa', ideCpcfa);
        cabQuery.values.set('fecha_desde_cpcfc', dtoIn.fecha_desde);
        cabQuery.values.set('fecha_hasta_cpcfc', dtoIn.fecha_hasta);
        listQuery.push(cabQuery);

        dtoIn.envios.forEach((envio, idx) => {
            const detQuery = new InsertQuery('cxp_det_flete_cons', 'ide_cpdfc', dtoIn);
            detQuery.values.set('ide_cpdfc', baseIdeCpdfc + idx);
            detQuery.values.set('ide_cpcfc', ideCpcfc);
            detQuery.values.set('ide_cctfa', envio.ide_cctfa);
            // Vínculo real a la línea de la factura (mismo orden que dtoIn.detalles, ambos
            // construidos por el frontend a partir del mismo enviosState) - "valor facturado"
            // se lee siempre en vivo desde cxp_detall_factur vía este ide_cpdfa, nunca de una
            // copia (ver flete-consolidado.service.ts getFleteConsolidadoById/getFletesConsolidados).
            detQuery.values.set('ide_cpdfa', detallesIdeCpdfa[idx]);
            listQuery.push(detQuery);

            // total_flete_real_cctfa: mismo campo que ya usa el flujo de un solo envío para
            // el "valor real" del flete (ver EnvioFacturaCxPService) - aquí es el valor que
            // le corresponde a ESE envío dentro de la factura consolidada, no el total de la
            // factura completa. base_flete_real_cctfa/valor_iva_flete_real_cctfa no se pueden
            // reconstruir de forma confiable a este nivel de detalle (el usuario solo reasigna
            // qué envío corresponde a qué línea, no edita el valor) y quedan sin tocar.
            const updEnvio = new UpdateQuery('cxc_transporte_factura', 'ide_cctfa', dtoIn);
            updEnvio.values.set('ide_cpcfa', ideCpcfa);
            updEnvio.values.set('total_flete_real_cctfa', envio.valor);
            updEnvio.values.set('fecha_actua', getCurrentDate());
            updEnvio.values.set('hora_actua', getCurrentTime());
            updEnvio.where = `ide_cctfa = $1`;
            updEnvio.addIntParam(1, envio.ide_cctfa);
            listQuery.push(updEnvio);
        });

        await this.dataSource.createListQuery(listQuery);

        return { message: 'ok', ide_cpcfc: ideCpcfc, ide_cpcfa: ideCpcfa };
    }

    /**
     * Anula todo el proceso: reversa el pago de tesorería y su asiento, la cuenta por pagar y
     * el kardex (documentosCxPSaveService.anularDocumento, sin cambios - igual que anular un
     * pago 1 a 1), desvincula los envíos de la factura, y marca la tabla de control anulada.
     */
    async anularFleteConsolidado(ideCpcfc: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`SELECT ide_cpcfa, ide_cpefc FROM cxp_cab_flete_cons WHERE ide_cpcfc = $1`);
        qCab.addIntParam(1, ideCpcfc);
        const cab = await this.dataSource.createSingleQuery(qCab);
        if (!cab) {
            throw new BadRequestException(`Factura consolidada ide_cpcfc=${ideCpcfc} no encontrada.`);
        }
        if (Number(cab.ide_cpefc) === ESTADO_ANULADO) {
            throw new BadRequestException('Esta factura consolidada ya está anulada.');
        }

        await this.documentosCxPSaveService.anularDocumento({ ...dtoIn, ide_cpcfa: cab.ide_cpcfa });

        const qDet = new SelectQuery(`SELECT ide_cctfa FROM cxp_det_flete_cons WHERE ide_cpcfc = $1`);
        qDet.addIntParam(1, ideCpcfc);
        const envios: { ide_cctfa: number }[] = await this.dataSource.createSelectQuery(qDet);

        await this.dataSource.pool.query(
            `UPDATE cxc_transporte_factura
                SET ide_cpcfa = NULL,
                    total_flete_real_cctfa = NULL,
                    base_flete_real_cctfa = NULL,
                    valor_iva_flete_real_cctfa = NULL
              WHERE ide_cctfa = ANY($1)`,
            [envios.map((e) => e.ide_cctfa)],
        );

        await this.dataSource.pool.query(
            `UPDATE cxp_cab_flete_cons SET ide_cpefc = $1 WHERE ide_cpcfc = $2`,
            [ESTADO_ANULADO, ideCpcfc],
        );

        return { message: 'ok', ide_cpcfa: cab.ide_cpcfa, ide_cpcfc: ideCpcfc };
    }

    /** Se llama tras registrar el pago (RegistrarPagoCxPDialog, sin cambios) para vincular el
     * movimiento de tesorería a la tabla de control y marcarla como pagada. */
    async marcarFleteConsolidadoPagado(dtoIn: MarcarPagadoFleteConsolidadoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE cxp_cab_flete_cons SET ide_cpefc = $1, ide_teclb = $2 WHERE ide_cpcfc = $3`,
            [ESTADO_PAGADO, dtoIn.ide_teclb, dtoIn.ide_cpcfc],
        );
        return { message: 'ok' };
    }
}
