import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { ConciliacionBancariaSaveService } from './conciliacion-bancaria-save.service';
import { ConciliacionBancariaService } from './conciliacion-bancaria.service';
import { ActualizarFechaErpDto, RegistrarMovimientoBancoDto, RegistrarMovimientosBancoDto } from './dto/conciliacion-bancaria.dto';

/**
 * Correcciones en el ERP que el auxiliar hace desde "Diferencias en Conciliación" para que una diferencia
 * desaparezca: igualar la fecha de un movimiento del libro de bancos a la del banco, o registrar en el libro
 * (con su asiento contable) un movimiento que el banco hizo y el ERP no tenía, típicamente una comisión.
 */
@Injectable()
export class AjustesErpConciliacionService extends BaseService {
    private readonly logger = new Logger(AjustesErpConciliacionService.name);
    private readonly listo: Promise<void>;

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: ConciliacionBancariaService,
        private readonly saveService: ConciliacionBancariaSaveService,
        private readonly asientos: AsientosAutomaticosService,
    ) {
        super();
        this.listo = this.core
            .getVariables(['p_tes_estado_lib_banco_normal', 'p_tes_nota_debito', 'p_tes_nota_credito', 'p_tes_cuenta_comision_bancaria'])
            .then((result) => { this.variables = result; });
    }

    /** Cuenta contable de gasto por defecto (variable de sistema p_tes_cuenta_comision_bancaria), o null si no está configurada/existe. */
    async getCuentaComision(ideEmpr: number) {
        await this.listo;
        const ide = Number(this.variables.get('p_tes_cuenta_comision_bancaria'));
        if (!ide) return null;
        const { rows } = await this.dataSource.pool.query(
            'SELECT ide_cndpc, codig_recur_cndpc, nombre_cndpc FROM con_det_plan_cuen WHERE ide_cndpc = $1 AND ide_empr = $2',
            [ide, ideEmpr],
        );
        return rows[0] ? { ide_cndpc: Number(rows[0].ide_cndpc), codig_recur_cndpc: rows[0].codig_recur_cndpc as string, nombre_cndpc: rows[0].nombre_cndpc as string } : null;
    }

    /**
     * Pone en un movimiento del ERP la fecha que tiene en el banco. Solo aplica a cruces 1 a 1 (un movimiento del
     * banco contra uno del ERP). Cambia la fecha del libro de bancos; el asiento contable conserva su fecha.
     */
    async actualizarFechaErp(dtoIn: ActualizarFechaErpDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);

        const { rows } = await this.dataSource.pool.query(
            `SELECT m.grupo_tecmt AS grupo, v.fecha_tecmv::text AS fecha_banco, l.fecha_trans_teclb::text AS fecha_erp,
                    l.fecha_venci_teclb::text AS fecha_venci, l.ide_tecba
             FROM tes_conciliacion_match m
             INNER JOIN tes_conciliacion_mov v ON v.ide_tecmv = m.ide_tecmv
             INNER JOIN tes_cab_libr_banc l ON l.ide_teclb = m.ide_teclb
             WHERE m.ide_tecnc = $1 AND m.ide_teclb = $2 AND m.activo_tecmt = true`,
            [dtoIn.ideTecnc, dtoIn.ideTeclb],
        );
        if (rows.length === 0) throw new NotFoundException('Ese movimiento del ERP no está cruzado en esta conciliación.');
        const grupo = rows[0].grupo;
        const { rows: miembros } = await this.dataSource.pool.query(
            `SELECT COUNT(DISTINCT ide_tecmv) AS bancos, COUNT(DISTINCT ide_teclb) AS erps
             FROM tes_conciliacion_match WHERE ide_tecnc = $1 AND grupo_tecmt = $2 AND activo_tecmt = true`,
            [dtoIn.ideTecnc, grupo],
        );
        if (Number(miembros[0].bancos) !== 1 || Number(miembros[0].erps) !== 1) {
            throw new BadRequestException('Este cruce agrupa varios movimientos: la fecha solo se puede igualar en cruces de uno contra uno.');
        }
        const fila = rows[0];
        if (Number(fila.ide_tecba) !== Number(cabecera.ide_tecba)) {
            throw new BadRequestException('El movimiento del ERP no pertenece a la cuenta de esta conciliación.');
        }
        if (fila.fecha_banco === fila.fecha_erp) {
            return { message: 'La fecha ya coincide con la del banco.', actualizado: false };
        }

        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE tes_cab_libr_banc
                 SET fecha_trans_teclb = $2,
                     fecha_venci_teclb = CASE WHEN fecha_venci_teclb = fecha_trans_teclb THEN $2::date ELSE fecha_venci_teclb END,
                     fecha_concilia_teclb = $2, usuario_actua = $3, fecha_actua = $4, hora_actua = $5
                 WHERE ide_teclb = $1`,
                [dtoIn.ideTeclb, fila.fecha_banco, dtoIn.login, getCurrentDate(), getCurrentTime()],
            );
            await this.saveService.sincronizarSnapshot(client, cabecera);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw e;
        } finally {
            client.release();
        }
        this.logger.log(`Fecha del movimiento ERP ${dtoIn.ideTeclb}: ${fila.fecha_erp} → ${fila.fecha_banco} (conciliación ${dtoIn.ideTecnc}, ${dtoIn.login})`);
        return { message: `Fecha actualizada: ${fila.fecha_erp} → ${fila.fecha_banco}.`, actualizado: true, fechaAnterior: fila.fecha_erp, fechaNueva: fila.fecha_banco };
    }

    /**
     * Registra varios movimientos del banco, uno a uno, contra la misma cuenta contable. Cada uno es independiente (su propio
     * movimiento, asiento y cruce): si alguno falla, los demás igual se registran y el error se informa por movimiento.
     */
    async registrarMovimientosBanco(dtoIn: RegistrarMovimientosBancoDto & HeaderParamsDto) {
        const ids = [...new Set(dtoIn.ideTecmvs)];
        const registrados: Array<{ ideTecmv: number; ide_teclb: number; numero_cnccc: string }> = [];
        const errores: Array<{ ideTecmv: number; mensaje: string }> = [];
        for (const ideTecmv of ids) {
            try {
                const r = await this.registrarMovimientoBanco({ ...dtoIn, ideTecmv, observacion: dtoIn.observacion });
                registrados.push({ ideTecmv, ide_teclb: r.ide_teclb, numero_cnccc: r.numero_cnccc });
            } catch (e: any) {
                errores.push({ ideTecmv, mensaje: e?.response?.message ?? e?.message ?? 'Error desconocido' });
            }
        }
        const message = errores.length === 0
            ? `${registrados.length} movimiento(s) registrado(s) y conciliado(s).`
            : `${registrados.length} registrado(s), ${errores.length} con error.`;
        return { message, registrados, errores };
    }

    /**
     * Registra en el libro de bancos un movimiento que el banco hizo y el ERP no tenía, con su asiento contable contra la
     * cuenta elegida, y lo cruza de inmediato con el movimiento del banco (así sale de las diferencias). Si algo falla a
     * medias se deshace lo ya creado.
     */
    async registrarMovimientoBanco(dtoIn: RegistrarMovimientoBancoDto & HeaderParamsDto) {
        await this.listo;
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);

        const { rows: movs } = await this.dataSource.pool.query(
            `SELECT ide_tecmv, fecha_tecmv::text AS fecha, documento_tecmv AS documento, descripcion_tecmv AS descripcion,
                    referencia_tecmv AS referencia, monto_tecmv AS monto, signo_tecmv AS signo, estado_tecmv AS estado
             FROM tes_conciliacion_mov WHERE ide_tecmv = $1 AND ide_tecnc = $2`,
            [dtoIn.ideTecmv, dtoIn.ideTecnc],
        );
        const mov = movs[0];
        if (!mov) throw new NotFoundException('El movimiento del banco no existe en esta conciliación.');
        if (mov.estado === 'CONCILIADO') throw new BadRequestException('Ese movimiento del banco ya está conciliado.');

        const { rows: cuentas } = await this.dataSource.pool.query(
            'SELECT ide_cndpc, nombre_cndpc, codig_recur_cndpc FROM con_det_plan_cuen WHERE ide_cndpc = $1 AND ide_empr = $2',
            [dtoIn.ideCndpc, dtoIn.ideEmpr],
        );
        if (cuentas.length === 0) throw new BadRequestException('La cuenta contable elegida no existe.');
        const { rows: banco } = await this.dataSource.pool.query(
            'SELECT ide_cndpc FROM tes_cuenta_banco WHERE ide_tecba = $1',
            [cabecera.ide_tecba],
        );
        if (!banco[0]?.ide_cndpc) {
            throw new BadRequestException('La cuenta bancaria no tiene cuenta contable configurada: no se puede generar el asiento.');
        }
        if (Number(banco[0].ide_cndpc) === Number(dtoIn.ideCndpc)) {
            throw new BadRequestException('La cuenta contable elegida no puede ser la misma cuenta del banco.');
        }

        // Tipo de transacción bancaria según el signo: egreso = nota de débito, ingreso = nota de crédito
        const esEgreso = Number(mov.signo) < 0;
        const ideTettb = Number(this.variables.get(esEgreso ? 'p_tes_nota_debito' : 'p_tes_nota_credito'));
        const { rows: tipos } = await this.dataSource.pool.query('SELECT signo_tettb FROM tes_tip_tran_banc WHERE ide_tettb = $1', [ideTettb]);
        if (!tipos[0] || Math.sign(Number(tipos[0].signo_tettb)) !== Number(mov.signo)) {
            throw new BadRequestException(
                `El tipo de transacción bancaria configurado (${esEgreso ? 'p_tes_nota_debito' : 'p_tes_nota_credito'}) no corresponde a un ${esEgreso ? 'egreso' : 'ingreso'}.`,
            );
        }

        const valor = Number(Number(mov.monto).toFixed(2));
        const descripcion = `${mov.descripcion ?? ''}${mov.referencia ? ` - ${mov.referencia}` : ''}`.trim();
        const observacion = (dtoIn.observacion?.trim() || descripcion || 'MOVIMIENTO BANCARIO').substring(0, 180);

        const ideTeclb = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO tes_cab_libr_banc (ide_teclb, ide_teelb, ide_tecba, ide_tettb, valor_teclb, numero_teclb, fecha_trans_teclb,
                fecha_venci_teclb, beneficiari_teclb, observacion_teclb, conciliado_teclb, depositado_teclb, devuelto_teclb,
                ide_empr, ide_sucu, usuario_ingre, fecha_ingre, hora_ingre)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, false, false, false, $10, $11, $12, $13, $14)`,
            [
                ideTeclb, Number(this.variables.get('p_tes_estado_lib_banco_normal')), cabecera.ide_tecba, ideTettb, valor,
                String(mov.documento || '000000').substring(0, 50), mov.fecha, cabecera.nombre_teban.substring(0, 100), observacion,
                cabecera.ide_empr, cabecera.ide_sucu, dtoIn.login, getCurrentDate(), getCurrentTime(),
            ],
        );

        let ideCnccc: number | null = null;
        try {
            const asiento = await this.asientos.generarAsientoMovimientoBancario({
                ...dtoIn,
                ideSucu: cabecera.ide_sucu,
                ideTeclb, ideTecba: cabecera.ide_tecba, ideCndpcContra: dtoIn.ideCndpc,
                fecha: mov.fecha, valor, esEgreso, observacion, referencia: `CONCILIACION ${dtoIn.ideTecnc}`,
            });
            ideCnccc = asiento.ide_cnccc;

            const client = await this.dataSource.pool.connect();
            try {
                await client.query('BEGIN');
                await this.saveService.crearGrupo(
                    client, cabecera, [Number(mov.ide_tecmv)], [ideTeclb], 'MANUAL', 'REGISTRO_BANCO', 100,
                    `Registrado desde diferencias en ${cuentas[0].codig_recur_cndpc} ${cuentas[0].nombre_cndpc}`, dtoIn.login,
                );
                await this.saveService.sincronizarSnapshot(client, cabecera);
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw e;
            } finally {
                client.release();
            }
            return {
                message: `Movimiento registrado con asiento ${asiento.numero_cnccc ?? ''}`.trim() + ' y conciliado.',
                ide_teclb: ideTeclb, ide_cnccc: ideCnccc, numero_cnccc: asiento.numero_cnccc,
            };
        } catch (e) {
            // Deshacer lo creado: el asiento (si llegó a generarse) y el movimiento del libro
            if (ideCnccc) await this.asientos.eliminarAsiento(ideCnccc, dtoIn);
            await this.dataSource.pool.query('DELETE FROM tes_cab_libr_banc WHERE ide_teclb = $1', [ideTeclb]).catch((err) =>
                this.logger.error(`No se pudo borrar el movimiento ${ideTeclb} tras el error: ${err}`));
            throw e;
        }
    }
}
