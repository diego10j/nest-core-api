import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { AnularMovimientoDto } from './dto/anular-movimiento.dto';
import { ReversarTransaccionDto } from './dto/reversar-transaccion.dto';
import { SaveDepositoCajaDto } from './dto/save-deposito-caja.dto';
import { SaveLibroBancoDto } from './dto/save-libro-banco.dto';
import { SaveTransferenciaDto } from './dto/save-transferencia.dto';

@Injectable()
export class PreLibroBancosSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
                'p_tes_tran_reversa_mas',
                'p_tes_tran_reversa_menos',
                'p_tes_tran_transferencia_mas',
                'p_tes_tran_transferencia_menos',
                'p_con_beneficiario_empresa',
                'p_con_estado_comprobante_anulado',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Anula un movimiento del libro bancos: cambia estado, marca asiento anulado,
     * elimina transacciones CxC/CxP asociadas, y desmarca deposito/devuelto
     */
    async anularMovimiento(dtoIn: AnularMovimientoDto & HeaderParamsDto) {
        const listQuery: ObjectQueryDto[] = [];

        // 1. Cambiar estado a ANULADO (ide_teelb = 1)
        listQuery.push({
            operation: 'update',
            module: 'tes',
            tableName: 'cab_libr_banc',
            primaryKey: 'ide_teclb',
            object: {
                ide_teclb: dtoIn.ideTeclb,
                ide_teelb: 1,
                usuario_actua: dtoIn.login,
            },
        });

        // 2. Resetear depositado/devuelto en el movimiento hijo
        await this.dataSource.pool.query(
            `UPDATE tes_cab_libr_banc SET depositado_teclb = false, devuelto_teclb = false WHERE tes_ide_teclb = $1`,
            [dtoIn.ideTeclb],
        );

        // 3. Buscar asiento contable asociado y anularlo
        const asientoQuery = new SelectQuery(`
            SELECT ide_cnccc FROM tes_cab_libr_banc WHERE ide_teclb = $1
        `);
        asientoQuery.addIntParam(1, dtoIn.ideTeclb);
        const asiento = await this.dataSource.createSingleQuery(asientoQuery);

        if (asiento?.ide_cnccc) {
            const pEstadoAnulado = this.variables.get('p_con_estado_comprobante_anulado');
            listQuery.push({
                operation: 'update',
                module: 'con',
                tableName: 'cab_comp_cont',
                primaryKey: 'ide_cnccc',
                object: {
                    ide_cnccc: asiento.ide_cnccc,
                    ide_cneco: Number(pEstadoAnulado),
                },
            });
            // Anular detalles del asiento
            await this.dataSource.pool.query(
                `UPDATE con_det_comp_cont SET valor_cndcc = 0 WHERE ide_cnccc = $1`,
                [asiento.ide_cnccc],
            );
        }

        // 4. Eliminar transacciones CxC y CxP
        await this.dataSource.pool.query(
            `DELETE FROM cxc_detall_transa WHERE ide_teclb = $1 AND numero_pago_ccdtr > 0`,
            [dtoIn.ideTeclb],
        );
        await this.dataSource.pool.query(
            `DELETE FROM cxp_detall_transa WHERE ide_teclb = $1 AND numero_pago_cpdtr > 0`,
            [dtoIn.ideTeclb],
        );

        return this.core.save({ ...dtoIn, listQuery, audit: false });
    }

    /**
     * Reversa una transaccion creando un movimiento inverso (signo opuesto)
     */
    async reversarTransaccion(dtoIn: ReversarTransaccionDto & HeaderParamsDto) {
        const transQuery = new SelectQuery(`SELECT * FROM tes_cab_libr_banc WHERE ide_teclb = $1`);
        transQuery.addIntParam(1, dtoIn.ideTeclb);
        const trans = await this.dataSource.createSingleQuery(transQuery);

        if (!trans) throw new BadRequestException('Transaccion no encontrada');

        const signoQuery = new SelectQuery(
            `SELECT signo_tettb FROM tes_tip_tran_banc WHERE ide_tettb = $1`,
        );
        signoQuery.addIntParam(1, trans.ide_tettb);
        const signoActual = await this.dataSource.createSingleQuery(signoQuery);
        const signo = Number(signoActual?.signo_tettb ?? 0);

        const ideTettbReversa = signo > 0
            ? Number(this.variables.get('p_tes_tran_reversa_menos'))
            : Number(this.variables.get('p_tes_tran_reversa_mas'));

        const ideTeclb = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const object: Record<string, any> = {
            ide_teclb: ideTeclb,
            ide_teelb: trans.ide_teelb,
            ide_tecba: trans.ide_tecba,
            ide_tettb: ideTettbReversa,
            valor_teclb: trans.valor_teclb,
            numero_teclb: dtoIn.numero ?? '000000',
            fecha_trans_teclb: dtoIn.fecha ?? getCurrentDate(),
            fecha_venci_teclb: getCurrentDate(),
            conciliado_teclb: false,
            observacion_teclb: dtoIn.observacion ?? '',
            beneficiari_teclb: dtoIn.beneficiario ?? trans.beneficiari_teclb ?? '',
            depositado_teclb: false,
            devuelto_teclb: false,
            hora_ingre: getCurrentTime(),
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
        };

        const objQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'tes',
            tableName: 'cab_libr_banc',
            primaryKey: 'ide_teclb',
            object,
        };

        return this.core.save({ ...dtoIn, listQuery: [objQuery], audit: false });
    }

    /**
     * Reversa un cheque devuelto, usando tipo 15 (CHEQUE DEVUELTO)
     */
    async reversarChequeDevuelto(
        dtoIn: ReversarTransaccionDto & { valor?: number } & HeaderParamsDto,
    ) {
        const transQuery = new SelectQuery(`SELECT * FROM tes_cab_libr_banc WHERE ide_teclb = $1`);
        transQuery.addIntParam(1, dtoIn.ideTeclb);
        const trans = await this.dataSource.createSingleQuery(transQuery);

        if (!trans) throw new BadRequestException('Transaccion no encontrada');

        const ideTeclb = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const object: Record<string, any> = {
            ide_teclb: ideTeclb,
            ide_teelb: trans.ide_teelb,
            ide_tecba: trans.ide_tecba,
            ide_tettb: 15,
            valor_teclb: dtoIn.valor ?? trans.valor_teclb,
            numero_teclb: dtoIn.numero ?? '000000',
            fecha_trans_teclb: dtoIn.fecha ?? getCurrentDate(),
            fecha_venci_teclb: getCurrentDate(),
            conciliado_teclb: false,
            observacion_teclb: dtoIn.observacion ?? '',
            beneficiari_teclb: dtoIn.beneficiario ?? trans.beneficiari_teclb ?? '',
            depositado_teclb: false,
            devuelto_teclb: false,
            hora_ingre: getCurrentTime(),
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
        };

        const objQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'tes',
            tableName: 'cab_libr_banc',
            primaryKey: 'ide_teclb',
            object,
        };

        return this.core.save({ ...dtoIn, listQuery: [objQuery], audit: false });
    }

    /**
     * Genera un registro en tes_cab_libr_banc (libro banco)
     */
    async generarLibroBanco(dtoIn: SaveLibroBancoDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const ideTeclb = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const object: Record<string, any> = {
            ide_teclb: ideTeclb,
            ide_teelb: ideTeelb,
            ide_tecba: dtoIn.ideTecba,
            ide_tettb: dtoIn.ideTettb,
            valor_teclb: dtoIn.valor,
            numero_teclb: dtoIn.numero ?? '000000',
            fecha_trans_teclb: dtoIn.fecha,
            fecha_venci_teclb: dtoIn.fecha,
            beneficiari_teclb: dtoIn.beneficiario ?? '',
            observacion_teclb: dtoIn.observacion ?? '',
            conciliado_teclb: false,
            fec_cam_est_teclb: dtoIn.fechaEfectivo ?? dtoIn.fecha,
            num_comprobante_teclb: dtoIn.numCuentaCheque ?? '',
            ide_teban: dtoIn.ideTeban ?? null,
            depositado_teclb: false,
            devuelto_teclb: false,
            hora_ingre: getCurrentTime(),
        };

        const objQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'tes',
            tableName: 'cab_libr_banc',
            primaryKey: 'ide_teclb',
            object,
        };

        const result = await this.core.save({ ...dtoIn, listQuery: [objQuery], audit: false });

        // Actualizar secuencial
        await this.actualizarSecuencial(dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.numero, dtoIn);

        return { ...result, ide_teclb: ideTeclb };
    }

    /**
     * Genera un movimiento en libro banco para "otras transacciones"
     */
    async generarLibroBancoOtros(
        dtoIn: SaveLibroBancoDto & { numComprobante?: string } & HeaderParamsDto,
    ) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const ideTeclb = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const object: Record<string, any> = {
            ide_teclb: ideTeclb,
            ide_teelb: ideTeelb,
            ide_tecba: dtoIn.ideTecba,
            ide_tettb: dtoIn.ideTettb,
            valor_teclb: dtoIn.valor,
            numero_teclb: dtoIn.numero ?? '000000',
            fecha_trans_teclb: dtoIn.fecha,
            fecha_venci_teclb: dtoIn.fecha,
            beneficiari_teclb: dtoIn.beneficiario ?? '',
            observacion_teclb: dtoIn.observacion ?? '',
            conciliado_teclb: false,
            fec_cam_est_teclb: dtoIn.fechaEfectivo ?? null,
            num_comprobante_teclb: (dtoIn as any).numComprobante ?? '',
            depositado_teclb: false,
            devuelto_teclb: false,
            hora_ingre: getCurrentTime(),
        };

        const objQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'tes',
            tableName: 'cab_libr_banc',
            primaryKey: 'ide_teclb',
            object,
        };

        const result = await this.core.save({ ...dtoIn, listQuery: [objQuery], audit: false });
        await this.actualizarSecuencial(dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.numero, dtoIn);

        return { ...result, ide_teclb: ideTeclb };
    }

    /**
     * Genera 2 movimientos de libro banco: retiro de cuenta origen + ingreso a cuenta destino
     */
    async generarTransferencia(dtoIn: SaveTransferenciaDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const ideTettbMas = Number(this.variables.get('p_tes_tran_transferencia_mas'));

        // Buscar beneficiario empresa
        const ideBenef = Number(this.variables.get('p_con_beneficiario_empresa'));
        const persQuery = new SelectQuery(
            `SELECT nom_geper FROM gen_persona WHERE ide_geper = $1 LIMIT 1`,
        );
        persQuery.addIntParam(1, ideBenef);
        const persona = await this.dataSource.createSingleQuery(persQuery);
        const beneficiario = persona?.nom_geper ?? '';

        const ideRetiro = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );
        const ideIngreso = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const listQuery: ObjectQueryDto[] = [
            // Retiro de cuenta origen
            {
                operation: 'insert',
                module: 'tes',
                tableName: 'cab_libr_banc',
                primaryKey: 'ide_teclb',
                object: {
                    ide_teclb: ideRetiro,
                    ide_teelb: ideTeelb,
                    ide_tecba: dtoIn.ideTecbaOrigen,
                    ide_tettb: dtoIn.ideTettb,
                    valor_teclb: dtoIn.valor,
                    numero_teclb: dtoIn.numero ?? '000000',
                    fecha_trans_teclb: dtoIn.fecha,
                    fecha_venci_teclb: dtoIn.fecha,
                    beneficiari_teclb: beneficiario,
                    observacion_teclb: dtoIn.observacion ?? '',
                    conciliado_teclb: false,
                    depositado_teclb: false,
                    devuelto_teclb: false,
                    hora_ingre: getCurrentTime(),
                },
            },
            // Ingreso a cuenta destino
            {
                operation: 'insert',
                module: 'tes',
                tableName: 'cab_libr_banc',
                primaryKey: 'ide_teclb',
                object: {
                    ide_teclb: ideIngreso,
                    ide_teelb: ideTeelb,
                    ide_tecba: dtoIn.ideTecbaDestino,
                    ide_tettb: ideTettbMas,
                    valor_teclb: dtoIn.valor,
                    numero_teclb: dtoIn.numero ?? '000000',
                    fecha_trans_teclb: dtoIn.fecha,
                    fecha_venci_teclb: dtoIn.fecha,
                    beneficiari_teclb: beneficiario,
                    observacion_teclb: dtoIn.observacion ?? '',
                    conciliado_teclb: false,
                    depositado_teclb: false,
                    devuelto_teclb: false,
                    hora_ingre: getCurrentTime(),
                },
            },
        ];

        const result = await this.core.save({ ...dtoIn, listQuery, audit: false });
        await this.actualizarSecuencial(dtoIn.ideTecbaOrigen, dtoIn.ideTettb, dtoIn.numero, dtoIn);

        return { ...result, ide_teclb_retiro: ideRetiro, ide_teclb_ingreso: ideIngreso };
    }

    /**
     * Genera deposito de caja a banco (retiro de caja + ingreso a banco)
     */
    async generarDepositoCaja(dtoIn: SaveDepositoCajaDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const ideTettbMenos = Number(this.variables.get('p_tes_tran_transferencia_menos'));

        // Buscar beneficiario empresa
        const ideBenef = Number(this.variables.get('p_con_beneficiario_empresa'));
        const persQuery = new SelectQuery(
            `SELECT nom_geper FROM gen_persona WHERE ide_geper = $1 LIMIT 1`,
        );
        persQuery.addIntParam(1, ideBenef);
        const persona = await this.dataSource.createSingleQuery(persQuery);
        const beneficiario = persona?.nom_geper ?? '';

        const ideRetiro = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );
        const ideIngreso = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const listQuery: ObjectQueryDto[] = [
            // Retiro de caja
            {
                operation: 'insert',
                module: 'tes',
                tableName: 'cab_libr_banc',
                primaryKey: 'ide_teclb',
                object: {
                    ide_teclb: ideRetiro,
                    ide_teelb: ideTeelb,
                    ide_tecba: dtoIn.ideTecbaOrigen,
                    ide_tettb: ideTettbMenos,
                    valor_teclb: dtoIn.valor,
                    numero_teclb: dtoIn.numero ?? '000000',
                    fecha_trans_teclb: dtoIn.fecha,
                    fecha_venci_teclb: dtoIn.fecha,
                    beneficiari_teclb: beneficiario,
                    observacion_teclb: dtoIn.observacion ?? '',
                    conciliado_teclb: false,
                    depositado_teclb: false,
                    devuelto_teclb: false,
                    hora_ingre: getCurrentTime(),
                },
            },
            // Ingreso a banco
            {
                operation: 'insert',
                module: 'tes',
                tableName: 'cab_libr_banc',
                primaryKey: 'ide_teclb',
                object: {
                    ide_teclb: ideIngreso,
                    ide_teelb: ideTeelb,
                    ide_tecba: dtoIn.ideTecbaDestino,
                    ide_tettb: dtoIn.ideTettb,
                    valor_teclb: dtoIn.valor,
                    numero_teclb: dtoIn.numero ?? '000000',
                    fecha_trans_teclb: dtoIn.fecha,
                    fecha_venci_teclb: dtoIn.fecha,
                    beneficiari_teclb: beneficiario,
                    observacion_teclb: dtoIn.observacion ?? '',
                    conciliado_teclb: false,
                    depositado_teclb: false,
                    devuelto_teclb: false,
                    hora_ingre: getCurrentTime(),
                },
            },
        ];

        const result = await this.core.save({ ...dtoIn, listQuery, audit: false });
        await this.actualizarSecuencial(dtoIn.ideTecbaOrigen, dtoIn.ideTettb, dtoIn.numero, dtoIn);

        return { ...result, ide_teclb_retiro: ideRetiro, ide_teclb_ingreso: ideIngreso };
    }

    /**
     * Genera una transaccion generica en tes_cab_libr_banc directa
     */
    async generarTransaccion(
        dtoIn: { ideTecba: number; ideTettb: number; valor: number; observacion?: string; numero?: string; fechaTransaccion?: string; beneficiario?: string } & HeaderParamsDto,
    ) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const ideTeclb = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const object: Record<string, any> = {
            ide_teclb: ideTeclb,
            ide_teelb: ideTeelb,
            ide_tecba: dtoIn.ideTecba,
            ide_tettb: dtoIn.ideTettb,
            valor_teclb: dtoIn.valor,
            numero_teclb: dtoIn.numero ?? '000000',
            fecha_trans_teclb: dtoIn.fechaTransaccion ?? getCurrentDate(),
            fecha_venci_teclb: dtoIn.fechaTransaccion ?? getCurrentDate(),
            fec_cam_est_teclb: null,
            conciliado_teclb: false,
            beneficiari_teclb: dtoIn.beneficiario ?? '',
            observacion_teclb: dtoIn.observacion ?? '',
            depositado_teclb: false,
            devuelto_teclb: false,
            hora_ingre: getCurrentTime(),
        };

        const objQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'tes',
            tableName: 'cab_libr_banc',
            primaryKey: 'ide_teclb',
            object,
        };

        const result = await this.core.save({ ...dtoIn, listQuery: [objQuery], audit: false });
        await this.actualizarSecuencial(dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.numero, dtoIn);

        return { ...result, ide_teclb: ideTeclb };
    }

    /**
     * Actualiza el numero maximo en tes_secuencial_trans para un tipo de transaccion
     */
    async actualizarSecuencial(
        ideTecba: number, ideTettb: number, numero: string, dtoIn: HeaderParamsDto,
    ) {
        if (!numero) return;

        const numStr = numero.replace(/\D/g, '');
        if (!numStr) return;

        let numIng: bigint;
        try {
            numIng = BigInt(numStr);
        } catch {
            return;
        }

        const PG_BIGINT_MAX = 9223372036854775807n;
        if (numIng <= 0n || numIng > PG_BIGINT_MAX) return;

        const numValue = Number(numIng);

        const existQuery = new SelectQuery(`
            SELECT ide_tesec, secuencial_tesec
            FROM tes_secuencial_trans
            WHERE ide_tecba = $1 AND ide_tettb = $2 AND ide_sucu = $3
            LIMIT 1
        `);
        existQuery.addIntParam(1, ideTecba);
        existQuery.addIntParam(2, ideTettb);
        existQuery.addIntParam(3, dtoIn.ideSucu);
        const existente = await this.dataSource.createSingleQuery(existQuery);

        if (existente) {
            await this.dataSource.pool.query(
                `UPDATE tes_secuencial_trans SET secuencial_tesec = $1 WHERE ide_tecba = $2 AND ide_tettb = $3 AND ide_sucu = $4`,
                [numValue, ideTecba, ideTettb, dtoIn.ideSucu],
            );
        } else {
            const ideTesec = await this.dataSource.getSeqTable('tes_secuencial_trans', 'ide_tesec', 1, dtoIn.login);
            await this.dataSource.pool.query(
                `INSERT INTO tes_secuencial_trans (ide_tesec, ide_tecba, ide_tettb, ide_empr, ide_sucu, secuencial_tesec) VALUES ($1, $2, $3, $4, $5, $6)`,
                [ideTesec, ideTecba, ideTettb, dtoIn.ideEmpr, dtoIn.ideSucu, numValue],
            );
        }
    }

    /**
     * Crea un beneficiario en gen_persona
     */
    async crearBeneficiario(
        dtoIn: { identificacion: string; ideGetid: number; nombre: string } & HeaderParamsDto,
    ) {
        const ideGeper = await this.dataSource.getSeqTable(
            'gen_persona', 'ide_geper', 1, dtoIn.login,
        );

        const objQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'gen',
            tableName: 'persona',
            primaryKey: 'ide_geper',
            object: {
                ide_geper: ideGeper,
                es_proveedo_geper: true,
                es_cliente_geper: false,
                nivel_geper: 'HIJO',
                fecha_ingre_geper: getCurrentDate(),
                ide_cntco: 2,
                identificac_geper: dtoIn.identificacion,
                ide_getid: dtoIn.ideGetid,
                nom_geper: dtoIn.nombre,
                hora_ingre: getCurrentTime(),
            },
        };

        await this.core.save({ ...dtoIn, listQuery: [objQuery], audit: false });
        return { ide_geper: ideGeper };
    }
}
