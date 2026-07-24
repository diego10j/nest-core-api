import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SaveDto } from 'src/common/dto/save.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime, toPgDate } from 'src/util/helpers/date-util';
import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';

import { SetCuentaContableProveedorDto } from './dto/cuenta-contable-proveedor.dto';
import { SaveTrnProveedorDto } from './dto/save-trn-proveedor.dto';
import { SaveCtaBancoProveedorDto } from './dto/save-cta-banco-proveedor.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';

/** Identificador de configuración contable del proveedor */
const IDENTIFICADOR_CUENTA_CXP = 'CUENTA POR PAGAR';

/**
 * Servicio de persistencia de proveedores: CRUD de gen_persona con creación
 * automática de la cuenta contable, configuración de la cuenta y registro de
 * transacciones manuales de CxP. Migrado de pre_proveedores.java del legacy.
 */
@Injectable()
export class ProveedorSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_gen_tipo_identificacion_cedula',
                'p_gen_tipo_iden_ruc',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRUD Proveedor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza un proveedor (gen_persona). La cuenta contable NO se
     * crea automáticamente aquí; debe vincularse aparte con
     * `setCuentaContableProveedor`.
     */
    async saveProveedor(dtoIn: SaveDto & HeaderParamsDto) {
        try {
            const data = dtoIn.data ?? {};
            data.es_proveedo_geper = true;

            this.validarIdentificacionProveedor(data);

            if (dtoIn.isUpdate) {
                if (!isDefined(data.ide_geper)) {
                    throw new BadRequestException('Se requiere ide_geper para actualizar el proveedor');
                }
                const ideGeper = Number(data.ide_geper);
                await this.validarDuplicado(data.identificac_geper, dtoIn.ideEmpr, ideGeper);
                return this.core.save({
                    ...dtoIn,
                    listQuery: [{
                        operation: 'update',
                        module: 'gen',
                        tableName: 'persona',
                        primaryKey: 'ide_geper',
                        object: data,
                        condition: `ide_geper = ${ideGeper}`,
                    }],
                    audit: false,
                });
            }

            // Crear
            if (!data.identificac_geper) throw new BadRequestException('La identificación es obligatoria');
            if (!data.nom_geper) throw new BadRequestException('El nombre del proveedor es obligatorio');
            if (!isDefined(data.ide_getid)) throw new BadRequestException('Debe seleccionar el tipo de identificación');
            if (!isDefined(data.ide_cntco)) throw new BadRequestException('Debe seleccionar el tipo de contribuyente');
            await this.validarDuplicado(data.identificac_geper, dtoIn.ideEmpr);

            const ideGeper = await this.dataSource.getSeqTable('gen_persona', 'ide_geper', 1, dtoIn.login);
            data.ide_geper = ideGeper;
            data.nivel_geper = data.nivel_geper ?? 'HIJO';
            data.activo_geper = data.activo_geper ?? true;

            await this.core.save({
                ...dtoIn,
                listQuery: [{
                    operation: 'insert',
                    module: 'gen',
                    tableName: 'persona',
                    primaryKey: 'ide_geper',
                    object: data,
                }],
                audit: true,
            });

            return {
                message: 'ok',
                ide_geper: ideGeper,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el proveedor: ${msg}`);
        }
    }

    /**
     * Vincula (crea o actualiza) la cuenta contable del proveedor en
     * con_det_conf_asie bajo la vigencia activa de 'CUENTA POR PAGAR'
     */
    async setCuentaContableProveedor(dtoIn: SetCuentaContableProveedorDto & HeaderParamsDto) {
        const ideCnvca = await this.getVigenciaCuentaPorPagar(dtoIn.ideSucu);

        const qExiste = new SelectQuery(`
            SELECT ide_cndca FROM con_det_conf_asie
            WHERE ide_geper = $1 AND ide_cnvca = $2
            LIMIT 1
        `);
        qExiste.addIntParam(1, dtoIn.ide_geper);
        qExiste.addIntParam(2, ideCnvca);
        const existente = await this.dataSource.createSingleQuery(qExiste);

        if (existente) {
            const upd = new UpdateQuery('con_det_conf_asie', 'ide_cndca', dtoIn);
            upd.values.set('ide_cndpc', dtoIn.ide_cndpc);
            upd.where = 'ide_cndca = $1';
            upd.addIntParam(1, Number(existente.ide_cndca));
            await this.dataSource.createListQuery([upd]);
        } else {
            const ideCndca = await this.dataSource.getSeqTable('con_det_conf_asie', 'ide_cndca', 1, dtoIn.login);
            const ins = new InsertQuery('con_det_conf_asie', 'ide_cndca', dtoIn);
            ins.values.set('ide_cndca', ideCndca);
            ins.values.set('ide_geper', dtoIn.ide_geper);
            ins.values.set('ide_cndpc', dtoIn.ide_cndpc);
            ins.values.set('ide_cnvca', ideCnvca);
            await this.dataSource.createListQuery([ins]);
        }
        return { message: 'ok', ide_geper: dtoIn.ide_geper, ide_cndpc: dtoIn.ide_cndpc };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Transacción manual de CxP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Registra una transacción manual en cxp_detall_transa (ajustes, cargos o
     * pagos manuales). Si no se asocia a una cuenta por pagar existente se crea
     * una cabecera nueva; si se asocia, la transacción se registra como pago
     * (numero_pago = 1) vinculada al documento de la cuenta. Opcionalmente
     * vincula un asiento contable existente. Paridad con la pantalla
     * "Ingresar Transacción" (pre_proveedores.guardar opción 10).
     */
    async saveTrnProveedor(dtoIn: SaveTrnProveedorDto & HeaderParamsDto) {
        try {
            const fechaTrans = toPgDate(dtoIn.fecha_trans_cpdtr) || getCurrentDate();

            // Validar asiento contable si se envía
            if (isDefined(dtoIn.ide_cnccc)) {
                const qAsiento = new SelectQuery(`
                    SELECT ide_cnccc FROM con_cab_comp_cont WHERE ide_cnccc = $1
                `);
                qAsiento.addIntParam(1, dtoIn.ide_cnccc!);
                const asiento = await this.dataSource.createSingleQuery(qAsiento);
                if (!asiento) {
                    throw new BadRequestException(`El asiento contable Num. ${dtoIn.ide_cnccc} no existe`);
                }
            }

            const listQuery: Query[] = [];
            let ideCpctr: number;
            let ideCpcfa: number | null = null;
            let numeroPago = 0;

            if (isDefined(dtoIn.ide_cpctr)) {
                // Asociada a una cuenta por pagar existente → es un pago/abono
                ideCpctr = Number(dtoIn.ide_cpctr);
                const qCab = new SelectQuery(`
                    SELECT ide_cpctr FROM cxp_cabece_transa
                    WHERE ide_cpctr = $1 AND ide_geper = $2
                `);
                qCab.addIntParam(1, ideCpctr);
                qCab.addIntParam(2, dtoIn.ide_geper);
                const cab = await this.dataSource.createSingleQuery(qCab);
                if (!cab) {
                    throw new BadRequestException(
                        `La cuenta por pagar ide_cpctr=${dtoIn.ide_cpctr} no existe o no pertenece al proveedor.`,
                    );
                }
                const qFactura = new SelectQuery(`
                    SELECT ide_cpcfa FROM cxp_detall_transa
                    WHERE ide_cpctr = $1 AND numero_pago_cpdtr = 0
                    ORDER BY ide_cpdtr
                    LIMIT 1
                `);
                qFactura.addIntParam(1, ideCpctr);
                const factura = await this.dataSource.createSingleQuery(qFactura);
                ideCpcfa = factura?.ide_cpcfa ?? null;
                numeroPago = 1;
            } else {
                // Sin cuenta por pagar → cabecera nueva
                ideCpctr = await this.dataSource.getSeqTable('cxp_cabece_transa', 'ide_cpctr', 1, dtoIn.login);
                const insCab = new InsertQuery('cxp_cabece_transa', 'ide_cpctr', dtoIn);
                insCab.values.set('ide_cpctr', ideCpctr);
                insCab.values.set('ide_geper', dtoIn.ide_geper);
                insCab.values.set('ide_cpttr', dtoIn.ide_cpttr);
                insCab.values.set('fecha_trans_cpctr', fechaTrans);
                insCab.values.set('observacion_cpctr', dtoIn.observacion_cpdtr);
                insCab.values.set('fecha_ingre', getCurrentDate());
                insCab.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insCab);
            }

            const ideCpdtr = await this.dataSource.getSeqTable('cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login);
            const insDet = new InsertQuery('cxp_detall_transa', 'ide_cpdtr', dtoIn);
            insDet.values.set('ide_cpdtr', ideCpdtr);
            insDet.values.set('ide_cpctr', ideCpctr);
            insDet.values.set('ide_cpttr', dtoIn.ide_cpttr);
            insDet.values.set('ide_usua', dtoIn.ideUsua);
            insDet.values.set('ide_cpcfa', ideCpcfa ?? null);
            insDet.values.set('fecha_trans_cpdtr', fechaTrans);
            insDet.values.set('fecha_venci_cpdtr', fechaTrans);
            insDet.values.set('valor_cpdtr', dtoIn.valor_cpdtr);
            insDet.values.set('observacion_cpdtr', dtoIn.observacion_cpdtr);
            insDet.values.set('docum_relac_cpdtr', dtoIn.docum_relac_cpdtr ?? null);
            insDet.values.set('numero_pago_cpdtr', numeroPago);
            insDet.values.set('valor_anticipo_cpdtr', 0);
            insDet.values.set('ide_cnccc', dtoIn.ide_cnccc ?? null);
            insDet.values.set('fecha_ingre', getCurrentDate());
            insDet.values.set('hora_ingre', getCurrentTime());
            listQuery.push(insDet);

            // Vincular asiento existente al documento y transacciones (paridad legacy)
            if (isDefined(dtoIn.ide_cnccc)) {
                if (ideCpcfa !== null) {
                    const updFactura = new UpdateQuery('cxp_cabece_factur', 'ide_cpcfa');
                    updFactura.values.set('ide_cnccc', dtoIn.ide_cnccc);
                    updFactura.where = 'ide_cpcfa = $1';
                    updFactura.addIntParam(1, ideCpcfa);
                    listQuery.push(updFactura);
                }
                const updTrn = new UpdateQuery('cxp_detall_transa', 'ide_cpdtr');
                updTrn.values.set('ide_cnccc', dtoIn.ide_cnccc);
                updTrn.where = 'ide_cpctr = $1 AND ide_cnccc IS NULL';
                updTrn.addIntParam(1, ideCpctr);
                listQuery.push(updTrn);
            }

            await this.dataSource.createListQuery(listQuery);

            return {
                message: 'ok',
                ide_cpctr: ideCpctr,
                ide_cpdtr: ideCpdtr,
                ide_cpcfa: ideCpcfa,
                numero_pago: numeroPago,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al registrar la transacción: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private validarIdentificacionProveedor(data: Record<string, any>) {
        const tipoCedula = this.variables.get('p_gen_tipo_identificacion_cedula');
        const tipoRuc = this.variables.get('p_gen_tipo_iden_ruc');
        const ideGetid = isDefined(data.ide_getid) ? String(data.ide_getid) : null;
        const identificacion = data.identificac_geper;

        if (!ideGetid || !identificacion) return;
        if (ideGetid === String(tipoCedula) && !validateCedula(identificacion)) {
            throw new BadRequestException('Debe ingresar un número de cédula válido');
        }
        if (ideGetid === String(tipoRuc) && !validateRUC(identificacion)) {
            throw new BadRequestException('Debe ingresar un número de RUC válido');
        }
    }

    private async validarDuplicado(identificacion: string, ideEmpr: number, excluirIdeGeper?: number) {
        if (!identificacion) return;
        const q = new SelectQuery(`
            SELECT ide_geper FROM gen_persona
            WHERE identificac_geper = $1 AND ide_empr = $2
            LIMIT 1
        `);
        q.addStringParam(1, identificacion);
        q.addIntParam(2, ideEmpr);
        const existente = await this.dataSource.createSingleQuery(q);
        if (existente && (!isDefined(excluirIdeGeper) || Number(existente.ide_geper) !== excluirIdeGeper)) {
            throw new BadRequestException(`Ya existe una persona registrada con la identificación ${identificacion}`);
        }
    }

    private async getVigenciaCuentaPorPagar(ideSucu: number): Promise<number> {
        const q = new SelectQuery(`
            SELECT v.ide_cnvca
            FROM con_vig_conf_asie v
            INNER JOIN con_cab_conf_asie c ON v.ide_cncca = c.ide_cncca
            WHERE UPPER(c.nombre_cncca) = $1
              AND v.estado_cnvca = true
              AND v.ide_sucu = $2
            LIMIT 1
        `);
        q.addStringParam(1, IDENTIFICADOR_CUENTA_CXP);
        q.addIntParam(2, ideSucu);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row?.ide_cnvca) {
            throw new BadRequestException(
                `No existe la configuración contable '${IDENTIFICADOR_CUENTA_CXP}' con vigencia activa.`,
            );
        }
        return Number(row.ide_cnvca);
    }

    async saveCtaBancoProveedor(dtoIn: SaveCtaBancoProveedorDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ideCpcbp != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideCpcbp: number;

        const object: Record<string, unknown> = {
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
            ide_geper: dtoIn.ideGeper,
            ide_teban: dtoIn.ideTeban ?? null,
            ide_tetcb: dtoIn.ideTetcb ?? null,
            numero_cpcbp: dtoIn.numeroCpcbp ?? null,
            nombre_cpcbp: dtoIn.nombreCpcbp ?? null,
            observacion_cpcbp: dtoIn.observacionCpcbp ?? null,
            activo_cpcbp: dtoIn.activoCpcbp ?? true,
            defecto_cpcbp: dtoIn.defectoCpcbp ?? false,
        };

        if (isUpdate) {
            ideCpcbp = dtoIn.ideCpcbp!;
            object.ide_cpcbp = ideCpcbp;
            listQuery.push({
                operation: 'update',
                module: 'cxp',
                tableName: 'cta_banco_prove',
                primaryKey: 'ide_cpcbp',
                object,
            });
        } else {
            ideCpcbp = await this.dataSource.getSeqTable('cxp_cta_banco_prove', 'ide_cpcbp', 1, dtoIn.login);
            object.ide_cpcbp = ideCpcbp;
            listQuery.push({
                operation: 'insert',
                module: 'cxp',
                tableName: 'cta_banco_prove',
                primaryKey: 'ide_cpcbp',
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideCpcbp };
    }

}
