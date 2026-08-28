import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { DepositoCajaSaveService } from 'src/core/modules/tesoreria/deposito-caja/deposito-caja-save.service';
import { PreLibroBancosSaveService } from 'src/core/modules/tesoreria/pre-libro-bancos/pre-libro-bancos-save.service';
import { getCurrentTime } from 'src/util/helpers/date-util';

import { ChequeDevueltoService } from './cheque-devuelto.service';
import { RegistrarChequeDevueltoDto } from './dto/registrar-cheque-devuelto.dto';

/** Tipo de transacción CxC "COMISION CHEQUE DEVUELTO" (ide_ccttr=17, signo_ccttr=1) - fila ya
 * existente en cxc_tipo_transacc, heredada del legacy sigafi (ServicioCuentasCxC.
 * generarTransaccionComisionCheDev usaba el mismo id) - mismo criterio de constante hardcodeada
 * que CxcTransaccionesSaveService.IDE_TETTB_CHEQUE_POSFECHADO_CXC. */
const IDE_CCTTR_COMISION_CHEQUE_DEVUELTO = 17;

/** Tipo de transacción bancaria "COMISION CH DEVUELTO" (ide_tettb=16, signo_tettb=-1, código
 * CCHD) - fila ya existente en tes_tip_tran_banc, para el movimiento de egreso que representa
 * el débito real del banco por la comisión. */
const IDE_TETTB_COMISION_CHEQUE_DEVUELTO = 16;

/**
 * Orquesta el registro de un Cheque por Cobrar Devuelto:
 * 1. Si el cheque ya estaba cubierto por un Depósito de Caja COMPLETADO, lo reversa primero
 *    (DepositoCajaSaveService.anular) - libera los movimientos y anula el asiento de transferencia.
 * 2. Reversa el cobro CxC original (PreLibroBancosSaveService.anularMovimiento - misma primitiva
 *    que "Consulta de Movimientos > Anular"): anula el movimiento, su asiento, borra la
 *    aplicación del pago en cxc_detall_transa y recalcula pagado_cccfa.
 * 3. Marca el cheque devuelto_teclb = true.
 * 4. Si el banco nos debitó una comisión (opcional): registra el movimiento bancario del débito
 *    + su asiento (gasto + IVA compras, config por nombre) y un CARGO INTERNO al cliente por el
 *    mismo monto (cxc_cabece_transa/cxc_detall_transa sin factura asociada - mismo patrón que
 *    "saldo a favor" en CxcTransaccionesSaveService.saveCobroCxC) + su propio asiento (ingreso +
 *    IVA en ventas). El cargo NO pasa por el pipeline de facturación electrónica SRI.
 */
@Injectable()
export class ChequeDevueltoSaveService extends BaseService {
    private readonly logger = new Logger(ChequeDevueltoSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: ChequeDevueltoService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly depositoCajaSaveService: DepositoCajaSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    async registrar(dtoIn: RegistrarChequeDevueltoDto & HeaderParamsDto) {
        const info = await this.consultas.getInfoChequeDevuelto(dtoIn.ideTeclb, dtoIn);
        if (!info) {
            throw new BadRequestException(`El cheque ide_teclb=${dtoIn.ideTeclb} no existe`);
        }
        if (info.devuelto_teclb) {
            throw new BadRequestException('Este cheque ya fue registrado como devuelto');
        }
        if (Number(info.ide_teelb) !== Number(info.ide_teelb_normal)) {
            throw new BadRequestException('Este cheque ya fue anulado o no se encuentra en estado normal');
        }

        const advertencias: string[] = [];
        const depositoReversado = !!(info.ide_tedca && info.completado_tedca);

        // 1. Si ya estaba depositado, reversar el depósito primero
        if (depositoReversado) {
            await this.depositoCajaSaveService.anular(Number(info.ide_tedca), {
                ...dtoIn,
                motivo: `Cheque devuelto: ${dtoIn.motivo}`,
            } as any);
        }

        // 2. Reversar el cobro CxC original
        await this.preLibroBancosSaveService.anularMovimiento({
            ...dtoIn,
            ideTeclb: dtoIn.ideTeclb,
        } as any);

        // 3. Marcar el cheque como devuelto
        await this.dataSource.pool.query(
            `UPDATE tes_cab_libr_banc SET devuelto_teclb = true, usuario_actua = $2, hora_actua = NOW()
             WHERE ide_teclb = $1`,
            [dtoIn.ideTeclb, dtoIn.login],
        );

        let ideCnccGasto: number | undefined;
        let ideCnccCargoCliente: number | undefined;

        // 4. Comisión bancaria (opcional - solo si el banco realmente nos debitó algo)
        if (dtoIn.tieneComision && Number(dtoIn.valorComision) > 0) {
            if (!dtoIn.ideTecbaComision) {
                throw new BadRequestException('Debe indicar la cuenta bancaria que el banco debitó por la comisión');
            }
            if (!info.ide_geper) {
                throw new BadRequestException(
                    'No se pudo determinar el cliente del cheque para cobrarle la comisión',
                );
            }

            const valorComision = Number(dtoIn.valorComision);
            const valorIva = Number(dtoIn.valorIvaComision ?? 0);
            const valorTotalComision = Number((valorComision + valorIva).toFixed(2));

            const ideTeelbNormal = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
            const ideTettbComision = IDE_TETTB_COMISION_CHEQUE_DEVUELTO;
            const ideCcttrCargo = IDE_CCTTR_COMISION_CHEQUE_DEVUELTO;

            const observacionComision =
                `COMISION CHEQUE DEVUELTO N.${dtoIn.ideTeclb} - ${dtoIn.motivo}`.substring(0, 180);

            // 4a. Movimiento bancario del débito (egreso real de la cuenta bancaria)
            const ideTeclbComision = await this.dataSource.getSeqTable(
                'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
            );
            const listQueryComision: ObjectQueryDto[] = [{
                operation: 'insert',
                module: 'tes',
                tableName: 'cab_libr_banc',
                primaryKey: 'ide_teclb',
                object: {
                    ide_teclb: ideTeclbComision,
                    ide_teelb: ideTeelbNormal,
                    ide_tecba: dtoIn.ideTecbaComision,
                    ide_tettb: ideTettbComision,
                    valor_teclb: valorTotalComision,
                    numero_teclb: '000000',
                    fecha_trans_teclb: dtoIn.fecha,
                    fecha_venci_teclb: dtoIn.fecha,
                    beneficiari_teclb: info.cliente ?? '',
                    observacion_teclb: observacionComision,
                    conciliado_teclb: false,
                    depositado_teclb: false,
                    devuelto_teclb: false,
                    ide_empr: dtoIn.ideEmpr,
                    ide_sucu: dtoIn.ideSucu,
                    usuario_ingre: dtoIn.login,
                    hora_ingre: getCurrentTime(),
                },
            }];
            await this.core.save({ ...dtoIn, listQuery: listQueryComision, audit: false });

            // 4b. Asiento del gasto (lado banco) - la propia función vincula ide_cnccc al movimiento
            const asientoGasto = await this.asientosAutomaticosService.generarAsientoComisionChequeDevuelto({
                ...dtoIn,
                ideTeclb: ideTeclbComision,
                fecha: dtoIn.fecha,
                ideTecba: dtoIn.ideTecbaComision,
                valorComision,
                valorIvaComision: valorIva,
                observacion: observacionComision,
            });
            ideCnccGasto = asientoGasto.ide_cnccc;
            advertencias.push(...(asientoGasto.advertencias ?? []));

            // 4c. Cargo interno al cliente - cxc_cabece_transa/detall_transa SIN ide_cccfa (sin
            // factura asociada, mismo patrón ya usado hoy para "saldo a favor"), sin pasar por
            // el pipeline de facturación electrónica SRI. numero_pago_ccdtr=0 porque no es la
            // aplicación de un pago contra una factura (a diferencia de un cobro real) - así
            // PreLibroBancosSaveService.anularMovimiento (que solo barre numero_pago_ccdtr > 0)
            // no lo confunde con eso si en el futuro se anula el movimiento de la comisión.
            const ideCcctrCargo = await this.dataSource.getSeqTable(
                'cxc_cabece_transa', 'ide_ccctr', 1, dtoIn.login,
            );
            const ideCcdtrCargo = await this.dataSource.getSeqTable(
                'cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login,
            );
            const listQueryCargo: ObjectQueryDto[] = [
                {
                    operation: 'insert',
                    module: 'cxc',
                    tableName: 'cabece_transa',
                    primaryKey: 'ide_ccctr',
                    object: {
                        ide_ccctr: ideCcctrCargo,
                        ide_geper: info.ide_geper,
                        fecha_trans_ccctr: dtoIn.fecha,
                        observacion_ccctr: observacionComision,
                        ide_empr: dtoIn.ideEmpr,
                        ide_sucu: dtoIn.ideSucu,
                        usuario_ingre: dtoIn.login,
                        hora_ingre: getCurrentTime(),
                    },
                },
                {
                    operation: 'insert',
                    module: 'cxc',
                    tableName: 'detall_transa',
                    primaryKey: 'ide_ccdtr',
                    object: {
                        ide_ccdtr: ideCcdtrCargo,
                        ide_ccctr: ideCcctrCargo,
                        ide_ccttr: ideCcttrCargo,
                        ide_teclb: ideTeclbComision,
                        ide_usua: dtoIn.ideUsua,
                        valor_ccdtr: valorTotalComision,
                        observacion_ccdtr: observacionComision,
                        numero_pago_ccdtr: 0,
                        fecha_trans_ccdtr: dtoIn.fecha,
                        fecha_venci_ccdtr: dtoIn.fecha,
                        docum_relac_ccdtr: `CHEQUE-${dtoIn.ideTeclb}`,
                        ide_empr: dtoIn.ideEmpr,
                        ide_sucu: dtoIn.ideSucu,
                        usuario_ingre: dtoIn.login,
                        hora_ingre: getCurrentTime(),
                    },
                },
            ];
            await this.core.save({ ...dtoIn, listQuery: listQueryCargo, audit: false });

            // 4d. Asiento del cargo al cliente
            const asientoCliente = await this.asientosAutomaticosService.generarAsientoCargoClienteChequeDevuelto({
                ...dtoIn,
                fecha: dtoIn.fecha,
                ideGeper: info.ide_geper,
                valorComision,
                valorIvaComision: valorIva,
                observacion: observacionComision,
            });
            ideCnccCargoCliente = asientoCliente.ide_cnccc;
            advertencias.push(...(asientoCliente.advertencias ?? []));

            if (ideCnccCargoCliente) {
                await this.dataSource.pool.query(
                    `UPDATE cxc_detall_transa SET ide_cnccc = $1 WHERE ide_ccdtr = $2`,
                    [ideCnccCargoCliente, ideCcdtrCargo],
                );
            }
        }

        return {
            message: 'ok',
            ide_teclb: dtoIn.ideTeclb,
            deposito_reversado: depositoReversado,
            ide_cnccc_gasto: ideCnccGasto ?? null,
            ide_cnccc_cargo_cliente: ideCnccCargoCliente ?? null,
            advertencias,
        };
    }
}
