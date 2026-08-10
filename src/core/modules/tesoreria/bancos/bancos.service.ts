import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetBancosDto } from './dto/get-bancos.dto';
import { GetCuentasBancoDto } from './dto/get-cuentas-banco.dto';
import { SimuladorCuentaTarjetaDto } from './dto/simulador-cuenta-tarjeta.dto';

@Injectable()
export class BancosService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─── BANCOS (tes_banco) ──────────────────────────────────────────────────

    async getBancos(dtoIn: GetBancosDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                b.ide_teban,
                b.nombre_teban,
                b.contacto_teban,
                b.telefono_teban,
                b.es_caja_teban,
                b.foto_teban,
                b.color_teban,
                b.es_tarjeta_teban,
        (select count(1) from tes_cuenta_banco cb where cb.ide_teban = b.ide_teban and cb.ide_empr = $1 and cb.ide_sucu = $2) as cantidad_cuentas
            FROM tes_banco b
            WHERE b.ide_empr = $1
              AND b.es_caja_teban = false
            ORDER BY b.nombre_teban
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createQuery(query, 'tes_banco');
    }

    async getListDataBancos(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                CAST(b.ide_teban AS VARCHAR) AS value,
                b.nombre_teban              AS label,
                b.es_tarjeta_teban
            FROM tes_banco b
            WHERE b.ide_empr = $1
              AND b.es_caja_teban = false
            ORDER BY b.nombre_teban
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    async getBancoById(ideTeban: number) {
        const query = new SelectQuery(`
            SELECT
                b.ide_teban,
                b.nombre_teban,
                b.contacto_teban,
                b.telefono_teban,
                b.es_caja_teban,
                b.foto_teban,
                b.color_teban,
                b.es_tarjeta_teban
            FROM tes_banco b
            WHERE b.ide_teban = $1
        `);
        query.addIntParam(1, ideTeban);
        return this.dataSource.createSingleQuery(query);
    }

    // ─── CUENTAS BANCARIAS (tes_cuenta_banco) ───────────────────────────────

    async getCuentasBanco(dtoIn: GetCuentasBancoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cb.ide_tecba,
                cb.ide_tetcb,
                cb.ide_teban,
                cb.ide_cndpc,
                tcb.nombre_tetcb,
                cb.nombre_tecba,
                cb.observacion_tecba,
                cb.hace_pagos_tecba,
                cb.hace_cheque_tecba,
                cta.codig_recur_cndpc || ' - ' || cta.nombre_cndpc AS cuenta,
                cb.activo_tecba,
                b.nombre_teban,
                b.color_teban,
                b.foto_teban,
                b.es_tarjeta_teban,
                cb.porcentaje_comision_tecba,
                cb.permite_diferido_tecba
            FROM tes_cuenta_banco cb
            LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            LEFT JOIN con_det_plan_cuen cta ON cta.ide_cndpc = cb.ide_cndpc
            LEFT JOIN tes_tip_cuen_banc tcb ON tcb.ide_tetcb = cb.ide_tetcb
            WHERE cb.ide_empr = $1
              AND cb.ide_sucu = $2
              AND ($3::int8 IS NULL OR cb.ide_teban = $3)
              AND ($4::boolean IS NULL OR cb.hace_pagos_tecba = $4)
              AND ($5::boolean IS NULL OR cb.hace_cheque_tecba = $5)
            ORDER BY b.nombre_teban, cb.nombre_tecba
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.ideTeban ?? null);
        query.addParam(4, dtoIn.hacePagos ?? null);
        query.addParam(5, dtoIn.haceCheque ?? null);
        return this.dataSource.createQuery(query, 'tes_cuenta_banco');
    }

    async getListDataCuentasBanco(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                CAST(cb.ide_tecba AS VARCHAR) AS value,
                cb.nombre_tecba              AS label
            FROM tes_cuenta_banco cb
            WHERE cb.ide_empr = $1
              AND cb.ide_sucu = $2
              AND cb.activo_tecba = true
            ORDER BY cb.nombre_tecba
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    async getCuentaBancoById(ideTecba: number) {
        const query = new SelectQuery(`
            SELECT
                cb.ide_tecba,
                cb.ide_tetcb,
                cb.ide_teban,
                cb.ide_cndpc,
                cb.nombre_tecba,
                cb.observacion_tecba,
                cb.hace_pagos_tecba,
                cb.hace_cheque_tecba,
                cb.activo_tecba,
                b.nombre_teban,
                b.es_tarjeta_teban,
                cb.porcentaje_comision_tecba,
                cb.permite_diferido_tecba,
                cb.porcentaje_comision_diferido_tecba,
                cb.iva_comision_tecba,
                cb.retiene_iva_tecba,
                cb.porcentaje_retencion_iva_tecba,
                cb.retiene_renta_tecba,
                cb.porcentaje_retencion_renta_tecba
            FROM tes_cuenta_banco cb
            LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            WHERE cb.ide_tecba = $1
        `);
        query.addIntParam(1, ideTecba);
        return this.dataSource.createSingleQuery(query);
    }

    // ─── CUENTAS TARJETA (tes_cuenta_banco de bancos con es_tarjeta_teban) ──

    async getCuentasTarjeta(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cb.ide_tecba,
                cb.nombre_tecba,
                b.nombre_teban,
                b.foto_teban,
                b.color_teban,
                cb.porcentaje_comision_tecba,
                cb.permite_diferido_tecba,
                cb.porcentaje_comision_diferido_tecba,
                cb.iva_comision_tecba,
                cb.retiene_iva_tecba,
                cb.retiene_renta_tecba
            FROM tes_cuenta_banco cb
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            WHERE cb.ide_empr = $1
              AND cb.ide_sucu = $2
              AND cb.activo_tecba = true
              AND b.es_tarjeta_teban = true
            ORDER BY b.nombre_teban, cb.nombre_tecba
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    async getConfiguracionCuentaTarjeta(ideTecba: number) {
        const query = new SelectQuery(`
            SELECT
                cb.ide_tecba,
                cb.nombre_tecba,
                cb.ide_teban,
                b.nombre_teban,
                b.es_tarjeta_teban,
                cb.porcentaje_comision_tecba,
                cb.permite_diferido_tecba,
                cb.porcentaje_comision_diferido_tecba,
                cb.iva_comision_tecba,
                cb.retiene_iva_tecba,
                cb.porcentaje_retencion_iva_tecba,
                cb.retiene_renta_tecba,
                cb.porcentaje_retencion_renta_tecba,
                cb.activo_tecba
            FROM tes_cuenta_banco cb
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            WHERE cb.ide_tecba = $1
        `);
        query.addIntParam(1, ideTecba);
        const cuenta = await this.dataSource.createSingleQuery(query);
        if (!cuenta) {
            throw new BadRequestException('Cuenta de tarjeta no encontrada');
        }
        if (!cuenta.es_tarjeta_teban) {
            throw new BadRequestException(`La cuenta "${cuenta.nombre_tecba}" no pertenece a un banco marcado como tarjeta (es_tarjeta_teban)`);
        }
        return cuenta;
    }

    /**
     * Simula la comisión que cobra el procesador de tarjeta (Datafast/Banco de Ecuador,
     * Payphone link de pagos, etc.) sobre un cobro con tarjeta, para saber cuánto se recibe
     * neto y cuánto conviene aumentar en la factura para no perder margen.
     *
     * La tarifa de IVA se deriva de baseImponible/valorIva (no se asume una fija) porque el
     * sistema maneja distintas tarifas según el artículo (0%/12%/15%) - la comisión del
     * procesador se grava con esa misma tarifa general vigente en la venta.
     */
    async simuladorCuentaTarjeta(dtoIn: SimuladorCuentaTarjetaDto & HeaderParamsDto) {
        const cuenta = await this.getConfiguracionCuentaTarjeta(dtoIn.ideTecba);

        const { baseImponible, valorIva, total, diferido } = dtoIn;

        const porcentajeComision = diferido && cuenta.permite_diferido_tecba
            ? Number(cuenta.porcentaje_comision_diferido_tecba ?? 0)
            : Number(cuenta.porcentaje_comision_tecba ?? 0);

        const tarifaIvaGeneral = baseImponible > 0 ? (valorIva / baseImponible) * 100 : 0;

        const valorComisionSinIva = total * (porcentajeComision / 100);
        const valorIvaComision = cuenta.iva_comision_tecba
            ? valorComisionSinIva * (tarifaIvaGeneral / 100)
            : 0;
        const valorComisionTotal = valorComisionSinIva + valorIvaComision;

        // Retención IVA/Renta: el procesador de tarjeta es agente de retención SOBRE EL PAGO
        // A LA CUENTA DEL COMERCIO (no sobre su propia comisión) - por norma SRI, las entidades
        // emisoras/procesadoras de tarjeta retienen IVA/Renta de lo que pagan a sus comercios
        // afiliados. Por eso la base es el IVA y la base imponible DE LA VENTA (valorIva /
        // baseImponible), no los de la comisión. Validado contra el simulador oficial de Bendo
        // (Régimen General, venta $15 = base $13.04 + IVA $1.96): retención IVA = 70% × $1.96 =
        // $1.37, retención Renta = 3% × $13.04 = $0.39, recibes = 15 - 0.69 - 1.37 - 0.39 =
        // $12.55 - coincide exacto. (Con retención 0% - RIMPE Negocio Popular - da $14.31,
        // que coincide con una transacción real verificada en dispositivo físico.)
        const valorRetencionIva = cuenta.retiene_iva_tecba
            ? valorIva * (Number(cuenta.porcentaje_retencion_iva_tecba ?? 0) / 100)
            : 0;
        const valorRetencionRenta = cuenta.retiene_renta_tecba
            ? baseImponible * (Number(cuenta.porcentaje_retencion_renta_tecba ?? 0) / 100)
            : 0;

        const valorNetoRecibir = total - valorComisionTotal - valorRetencionIva - valorRetencionRenta;
        // Para no perder margen hay que cubrir comisión + IVA de comisión + las retenciones,
        // ya que las tres cosas reducen lo que realmente se deposita en la cuenta.
        const valorSugeridoAumentar = valorComisionTotal + valorRetencionIva + valorRetencionRenta;
        const porcentajeSugeridoAumentar = total > 0 ? (valorSugeridoAumentar / total) * 100 : 0;

        const round2 = (n: number) => Math.round(n * 100) / 100;

        return {
            ideTecba: cuenta.ide_tecba,
            nombreTecba: cuenta.nombre_tecba,
            nombreTeban: cuenta.nombre_teban,
            diferido: !!diferido && !!cuenta.permite_diferido_tecba,
            porcentajeComisionAplicado: porcentajeComision,
            tarifaIvaGeneral: round2(tarifaIvaGeneral),
            valorComisionSinIva: round2(valorComisionSinIva),
            valorIvaComision: round2(valorIvaComision),
            valorComisionTotal: round2(valorComisionTotal),
            valorRetencionIva: round2(valorRetencionIva),
            valorRetencionRenta: round2(valorRetencionRenta),
            valorNetoRecibir: round2(valorNetoRecibir),
            valorSugeridoAumentar: round2(valorSugeridoAumentar),
            porcentajeSugeridoAumentar: round2(porcentajeSugeridoAumentar),
            totalSugeridoFactura: round2(total + valorSugeridoAumentar),
        };
    }
}
