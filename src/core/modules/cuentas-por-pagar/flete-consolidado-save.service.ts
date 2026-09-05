import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';

import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { AsociarFacturaExistenteFleteDto } from './dto/asociar-factura-existente-flete.dto';
import { CrearFacturaFleteConsolidadaDto } from './dto/crear-factura-flete-consolidada.dto';
import { MarcarPagadoFleteConsolidadoDto } from './dto/id-flete-consolidado.dto';
import { RegistrarGrupoEnviosFleteDto } from './dto/registrar-grupo-envios-flete.dto';
import { FleteConsolidadoService } from './flete-consolidado.service';

/** Estados de cxp_estado_flete_cons (seed en script-cxp-flete-consolidado.sql /
 * 7-flete-consolidado-pendiente-factura.sql). */
const ESTADO_PENDIENTE_FACTURA = 4;
const ESTADO_PENDIENTE_PAGO = 1;
const ESTADO_PAGADO = 2;
const ESTADO_ANULADO = 3;

/**
 * Guardado del flujo "Factura Consolidada de Flete": crea la factura CxP (reusando
 * DocumentosCxPSaveService.saveDocumento tal cual, sin tocar ese código), vincula los N
 * envíos y registra la tabla de control (cxp_cab_flete_cons/cxp_det_flete_cons). El registro
 * del pago en sí reusa RegistrarPagoCxPDialog/CxpTransaccionesSaveService.savePagoCxP sin
 * cambios - aquí solo se marca la tabla de control como pagada tras ese guardado.
 *
 * También soporta el caso "la factura del transportista llega días después": los envíos se
 * pueden registrar primero SIN factura (registrarGrupoEnviosSinFactura, estado "Pendiente
 * Factura") y completarse más tarde por XML (crearFacturaFleteConsolidada con ide_cpcfc) o
 * asociando una factura ya registrada en Documentos por Pagar (completarConFacturaExistente).
 * En ambos casos se puede reutilizar un anticipo ya pagado a ese proveedor en vez de crear un
 * pago nuevo (ver DocumentosCxPSaveService.saveDocumento / asociarAnticipoExistente).
 */
@Injectable()
export class FleteConsolidadoSaveService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly documentosCxPSaveService: DocumentosCxPSaveService,
        private readonly fleteConsolidadoService: FleteConsolidadoService,
    ) { }

    /** Registra el grupo de envíos SIN factura todavía (estado "Pendiente Factura"): no crea
     * ninguna factura CxP ni pide forma de pago - solo reserva los envíos hasta que se complete
     * con el XML del transportista (crearFacturaFleteConsolidada) o asociando una factura ya
     * existente (completarConFacturaExistente). */
    async registrarGrupoEnviosSinFactura(dtoIn: RegistrarGrupoEnviosFleteDto & HeaderParamsDto) {
        if (dtoIn.envios.length < 1) {
            throw new BadRequestException('Debe incluir al menos 1 envío.');
        }
        const ideCctfaSet = new Set(dtoIn.envios.map((e) => e.ide_cctfa));
        if (ideCctfaSet.size !== dtoIn.envios.length) {
            throw new BadRequestException('Hay envíos repetidos en la selección.');
        }

        const ideCctfas = dtoIn.envios.map((e) => e.ide_cctfa);
        const envios = await this.fleteConsolidadoService.getEnviosParaFacturar(ideCctfas, dtoIn);
        if (envios.length !== ideCctfas.length) {
            const faltantes = ideCctfas.filter((id) => !envios.some((e) => e.ide_cctfa === id));
            throw new BadRequestException(
                `Los siguientes envíos no existen o ya tienen factura registrada: ${faltantes.join(', ')}`,
            );
        }
        const ideVgtraSet = new Set(envios.map((e) => e.ide_vgtra));
        if (ideVgtraSet.size > 1) {
            throw new BadRequestException(
                'Los envíos seleccionados pertenecen a distintos transportistas: deben ser del mismo proveedor.',
            );
        }
        const ideGeperTransportista = envios[0].ide_geper_transporte;
        if (!ideGeperTransportista) {
            throw new BadRequestException('Los envíos seleccionados no tienen una empresa de transporte asignada.');
        }

        const ideCpcfc = await this.dataSource.getSeqTable('cxp_cab_flete_cons', 'ide_cpcfc', 1, dtoIn.login);
        const baseIdeCpdfc = await this.dataSource.getSeqTable(
            'cxp_det_flete_cons', 'ide_cpdfc', dtoIn.envios.length, dtoIn.login,
        );

        const listQuery: Query[] = [];

        const cabQuery = new InsertQuery('cxp_cab_flete_cons', 'ide_cpcfc', dtoIn);
        cabQuery.values.set('ide_cpcfc', ideCpcfc);
        cabQuery.values.set('ide_cpefc', ESTADO_PENDIENTE_FACTURA);
        cabQuery.values.set('ide_geper', ideGeperTransportista);
        // ide_cpcfa queda NULL - todavía no hay factura del transportista.
        cabQuery.values.set('fecha_desde_cpcfc', dtoIn.fecha_desde);
        cabQuery.values.set('fecha_hasta_cpcfc', dtoIn.fecha_hasta);
        listQuery.push(cabQuery);

        dtoIn.envios.forEach((envio, idx) => {
            const detQuery = new InsertQuery('cxp_det_flete_cons', 'ide_cpdfc', dtoIn);
            detQuery.values.set('ide_cpdfc', baseIdeCpdfc + idx);
            detQuery.values.set('ide_cpcfc', ideCpcfc);
            detQuery.values.set('ide_cctfa', envio.ide_cctfa);
            // ide_cpdfa queda NULL - sin factura no hay línea real de cxp_detall_factur que
            // referenciar todavía; valor_cpdfc/observacion_cpdfc guardan lo estimado por ahora.
            detQuery.values.set('valor_cpdfc', envio.valor);
            detQuery.values.set('observacion_cpdfc', envio.observacion ?? null);
            listQuery.push(detQuery);
        });

        await this.dataSource.createListQuery(listQuery);
        return { message: 'ok', ide_cpcfc: ideCpcfc };
    }

    /**
     * Crea la factura CxP consolidada a partir del XML y vincula los envíos incluidos. Si
     * `dtoIn.ide_cpcfc` viene informado, en vez de crear un grupo nuevo COMPLETA uno que ya
     * estaba "Pendiente Factura" (creado por registrarGrupoEnviosSinFactura): actualiza su
     * cabecera/detalle en vez de insertar filas nuevas, validando que los envíos coincidan
     * exactamente con los que ese grupo ya tenía reservados.
     */
    async crearFacturaFleteConsolidada(dtoIn: CrearFacturaFleteConsolidadaDto & HeaderParamsDto) {
        if (dtoIn.envios.length < 1) {
            throw new BadRequestException('Debe incluir al menos 1 envío.');
        }
        const ideCctfaSet = new Set(dtoIn.envios.map((e) => e.ide_cctfa));
        if (ideCctfaSet.size !== dtoIn.envios.length) {
            throw new BadRequestException('Hay envíos repetidos en el emparejamiento.');
        }

        let grupoExistente: { ide_cpdfc: number; ide_cctfa: number }[] | null = null;
        if (dtoIn.ide_cpcfc != null) {
            const qCab = new SelectQuery(
                `SELECT ide_cpefc FROM cxp_cab_flete_cons WHERE ide_cpcfc = $1 AND ide_empr = $2 AND ide_sucu = $3`,
            );
            qCab.addIntParam(1, dtoIn.ide_cpcfc);
            qCab.addIntParam(2, dtoIn.ideEmpr);
            qCab.addIntParam(3, dtoIn.ideSucu);
            const cab = await this.dataSource.createSingleQuery(qCab);
            if (!cab) {
                throw new BadRequestException(`Grupo ide_cpcfc=${dtoIn.ide_cpcfc} no encontrado.`);
            }
            if (Number(cab.ide_cpefc) !== ESTADO_PENDIENTE_FACTURA) {
                throw new BadRequestException('Este grupo de envíos ya tiene una factura asociada.');
            }

            const qDet = new SelectQuery(
                `SELECT ide_cpdfc, ide_cctfa FROM cxp_det_flete_cons WHERE ide_cpcfc = $1 ORDER BY ide_cpdfc`,
            );
            qDet.addIntParam(1, dtoIn.ide_cpcfc);
            grupoExistente = await this.dataSource.createSelectQuery(qDet);
            const idsExistentes = new Set(grupoExistente.map((d) => d.ide_cctfa));
            const coincide =
                idsExistentes.size === ideCctfaSet.size &&
                [...idsExistentes].every((id) => ideCctfaSet.has(id));
            if (!coincide) {
                throw new BadRequestException(
                    'Los envíos no coinciden con los que ya estaban reservados en este grupo pendiente.',
                );
            }
        }

        // 1. Factura CxP + cuenta por pagar: mismo mecanismo que el flujo de un solo envío
        // (sin ide_cctfa, así que saveDocumento no intenta vincular ningún envío por su cuenta).
        // Si dtoIn.ide_cpctr_anticipo viene informado, saveDocumento ya sabe reutilizar esa
        // cabecera de pago existente en vez de crear una nueva (ver
        // DocumentosCxPSaveService.resolverCabeceraTransaccion).
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

        // 2. Si se usó un anticipo, el pago ya existía de antes - se marca el grupo como pagado
        // directamente, sin pasar por Registrar Pago.
        const ideTeclbAnticipo = dtoIn.ide_cpctr_anticipo != null
            ? await this.buscarTeclbDeAnticipo(dtoIn.ide_cpctr_anticipo)
            : null;
        const estadoCab = ideTeclbAnticipo != null ? ESTADO_PAGADO : ESTADO_PENDIENTE_PAGO;

        // 3. Vincular los N envíos + tabla de control (insertar un grupo nuevo, o completar uno
        // "Pendiente Factura" ya existente), en su propia transacción.
        const listQuery: Query[] = [];
        let ideCpcfc: number;

        if (grupoExistente) {
            ideCpcfc = dtoIn.ide_cpcfc!;

            const cabQuery = new UpdateQuery('cxp_cab_flete_cons', 'ide_cpcfc', dtoIn);
            cabQuery.values.set('ide_cpcfa', ideCpcfa);
            cabQuery.values.set('ide_cpefc', estadoCab);
            if (ideTeclbAnticipo != null) cabQuery.values.set('ide_teclb', ideTeclbAnticipo);
            cabQuery.where = `ide_cpcfc = $1`;
            cabQuery.addIntParam(1, ideCpcfc);
            listQuery.push(cabQuery);

            dtoIn.envios.forEach((envio, idx) => {
                const detExistente = grupoExistente!.find((d) => d.ide_cctfa === envio.ide_cctfa)!;
                const detQuery = new UpdateQuery('cxp_det_flete_cons', 'ide_cpdfc', dtoIn);
                detQuery.values.set(
                    'ide_cpdfa',
                    dtoIn.envios.length === 1 ? detallesIdeCpdfa[0] : detallesIdeCpdfa[idx],
                );
                detQuery.where = `ide_cpdfc = $1`;
                detQuery.addIntParam(1, detExistente.ide_cpdfc);
                listQuery.push(detQuery);
                listQuery.push(this.buildActualizarEnvioQuery(envio, ideCpcfa, dtoIn));
            });
        } else {
            ideCpcfc = await this.dataSource.getSeqTable('cxp_cab_flete_cons', 'ide_cpcfc', 1, dtoIn.login);
            const baseIdeCpdfc = await this.dataSource.getSeqTable(
                'cxp_det_flete_cons', 'ide_cpdfc', dtoIn.envios.length, dtoIn.login,
            );

            const cabQuery = new InsertQuery('cxp_cab_flete_cons', 'ide_cpcfc', dtoIn);
            cabQuery.values.set('ide_cpcfc', ideCpcfc);
            cabQuery.values.set('ide_cpefc', estadoCab);
            cabQuery.values.set('ide_geper', dtoIn.cabecera.ide_geper);
            cabQuery.values.set('ide_cpcfa', ideCpcfa);
            if (ideTeclbAnticipo != null) cabQuery.values.set('ide_teclb', ideTeclbAnticipo);
            cabQuery.values.set('fecha_desde_cpcfc', dtoIn.fecha_desde);
            cabQuery.values.set('fecha_hasta_cpcfc', dtoIn.fecha_hasta);
            listQuery.push(cabQuery);

            dtoIn.envios.forEach((envio, idx) => {
                const detQuery = new InsertQuery('cxp_det_flete_cons', 'ide_cpdfc', dtoIn);
                detQuery.values.set('ide_cpdfc', baseIdeCpdfc + idx);
                detQuery.values.set('ide_cpcfc', ideCpcfc);
                detQuery.values.set('ide_cctfa', envio.ide_cctfa);
                // Vínculo real a la línea de la factura. Con 2+ envíos, dtoIn.detalles trae
                // exactamente 1 línea por envío en el mismo orden (ambos construidos por el
                // frontend a partir del mismo enviosState) - detallesIdeCpdfa[idx] es esa línea.
                // Con 1 solo envío, el XML puede haber quedado agrupado en 1-2 líneas por IVA
                // (sin ambigüedad posible, todo pertenece a este único envío) - se usa la
                // primera; el "valor facturado" para ese caso se compara contra el total de la
                // factura, no contra esta línea puntual (ver getFleteConsolidadoById/
                // getFletesConsolidados).
                detQuery.values.set(
                    'ide_cpdfa',
                    dtoIn.envios.length === 1 ? detallesIdeCpdfa[0] : detallesIdeCpdfa[idx],
                );
                listQuery.push(detQuery);
                listQuery.push(this.buildActualizarEnvioQuery(envio, ideCpcfa, dtoIn));
            });
        }

        await this.dataSource.createListQuery(listQuery);

        return { message: 'ok', ide_cpcfc: ideCpcfc, ide_cpcfa: ideCpcfa };
    }

    /**
     * Completa un grupo "Pendiente Factura" asociando una factura CxP que YA existe en
     * Documentos por Pagar (el transportista mandó la factura por otro medio y ya se registró
     * ahí manualmente), en vez de crearla desde un XML. El total de esa factura se reparte
     * proporcionalmente entre los envíos del grupo según el flete que se le cobró originalmente
     * a cada cliente (mismo criterio que "1 sola línea de XML para N envíos" en
     * FleteConsolidadoService.prepararFacturaFleteConsolidadaDesdeXml).
     */
    async completarConFacturaExistente(dtoIn: AsociarFacturaExistenteFleteDto & HeaderParamsDto) {
        const qCab = new SelectQuery(
            `SELECT ide_geper, ide_cpefc FROM cxp_cab_flete_cons WHERE ide_cpcfc = $1 AND ide_empr = $2 AND ide_sucu = $3`,
        );
        qCab.addIntParam(1, dtoIn.ide_cpcfc);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cab = await this.dataSource.createSingleQuery(qCab);
        if (!cab) {
            throw new BadRequestException(`Grupo ide_cpcfc=${dtoIn.ide_cpcfc} no encontrado.`);
        }
        if (Number(cab.ide_cpefc) !== ESTADO_PENDIENTE_FACTURA) {
            throw new BadRequestException('Este grupo de envíos ya tiene una factura asociada.');
        }

        const qFac = new SelectQuery(
            `SELECT ide_cpcfa, ide_geper, total_cpcfa, pagado_cpcfa
             FROM cxp_cabece_factur WHERE ide_cpcfa = $1 AND ide_empr = $2 AND ide_sucu = $3`,
        );
        qFac.addIntParam(1, dtoIn.ide_cpcfa);
        qFac.addIntParam(2, dtoIn.ideEmpr);
        qFac.addIntParam(3, dtoIn.ideSucu);
        const factura = await this.dataSource.createSingleQuery(qFac);
        if (!factura) {
            throw new BadRequestException(`Factura ide_cpcfa=${dtoIn.ide_cpcfa} no encontrada.`);
        }
        if (Number(factura.ide_geper) !== Number(cab.ide_geper)) {
            throw new BadRequestException('La factura seleccionada no pertenece al proveedor de este grupo de envíos.');
        }

        const qYaUsada = new SelectQuery(`SELECT ide_cpcfc FROM cxp_cab_flete_cons WHERE ide_cpcfa = $1`);
        qYaUsada.addIntParam(1, dtoIn.ide_cpcfa);
        const yaUsada = await this.dataSource.createSingleQuery(qYaUsada);
        if (yaUsada) {
            throw new BadRequestException('Esta factura ya está asociada a otro grupo de envíos.');
        }

        const qDet = new SelectQuery(
            `SELECT d.ide_cpdfc, d.ide_cctfa, e.total_flete_cctfa
             FROM cxp_det_flete_cons d
             INNER JOIN cxc_transporte_factura e ON d.ide_cctfa = e.ide_cctfa
             WHERE d.ide_cpcfc = $1
             ORDER BY d.ide_cpdfc`,
        );
        qDet.addIntParam(1, dtoIn.ide_cpcfc);
        const detalles: { ide_cpdfc: number; ide_cctfa: number; total_flete_cctfa: number }[] =
            await this.dataSource.createSelectQuery(qDet);
        if (detalles.length === 0) {
            throw new InternalServerErrorException('Este grupo no tiene envíos registrados.');
        }

        // Reparto proporcional del total de la factura entre los envíos, según lo que se cobró
        // originalmente a cada cliente - el último envío se lleva el residuo del redondeo para
        // que la suma cuadre exacto contra el total de la factura.
        const totalFactura = Number(factura.total_cpcfa);
        const pesoTotal = detalles.reduce((sum, d) => sum + Number(d.total_flete_cctfa || 0), 0);
        let acumulado = 0;
        const listQuery: Query[] = [];
        detalles.forEach((det, idx) => {
            const esUltimo = idx === detalles.length - 1;
            const peso = pesoTotal > 0 ? Number(det.total_flete_cctfa || 0) / pesoTotal : 1 / detalles.length;
            const valor = esUltimo
                ? Number((totalFactura - acumulado).toFixed(2))
                : Number((totalFactura * peso).toFixed(2));
            acumulado += valor;

            const updDet = new UpdateQuery('cxp_det_flete_cons', 'ide_cpdfc', dtoIn);
            updDet.values.set('valor_cpdfc', valor);
            updDet.where = `ide_cpdfc = $1`;
            updDet.addIntParam(1, det.ide_cpdfc);
            listQuery.push(updDet);

            listQuery.push(
                this.buildActualizarEnvioQuery({ ide_cctfa: det.ide_cctfa, valor }, dtoIn.ide_cpcfa, dtoIn),
            );
        });

        // Estado del grupo: pagado si la factura ya estaba pagada, o si se asocia un anticipo
        // ahora mismo (el pago ya existía de antes); si no, queda pendiente de pago, igual que
        // el flujo normal con Registrar Pago.
        const ideTeclbAnticipo = dtoIn.ide_cpctr_anticipo != null
            ? await this.asociarAnticipoExistente(dtoIn.ide_cpctr_anticipo, Number(cab.ide_geper), dtoIn.ide_cpcfa)
            : null;
        const nuevoEstado = factura.pagado_cpcfa || ideTeclbAnticipo != null ? ESTADO_PAGADO : ESTADO_PENDIENTE_PAGO;

        const updCab = new UpdateQuery('cxp_cab_flete_cons', 'ide_cpcfc', dtoIn);
        updCab.values.set('ide_cpcfa', dtoIn.ide_cpcfa);
        updCab.values.set('ide_cpefc', nuevoEstado);
        if (ideTeclbAnticipo != null) updCab.values.set('ide_teclb', ideTeclbAnticipo);
        updCab.where = `ide_cpcfc = $1`;
        updCab.addIntParam(1, dtoIn.ide_cpcfc);
        listQuery.push(updCab);

        await this.dataSource.createListQuery(listQuery);
        return { message: 'ok', ide_cpcfc: dtoIn.ide_cpcfc, ide_cpcfa: dtoIn.ide_cpcfa };
    }

    /**
     * Anula todo el proceso: si ya tenía factura, reversa el pago de tesorería y su asiento, la
     * cuenta por pagar y el kardex (documentosCxPSaveService.anularDocumento, sin cambios -
     * igual que anular un pago 1 a 1); si todavía estaba "Pendiente Factura" (sin factura ni
     * pago), solo libera los envíos. En ambos casos desvincula los envíos y marca la tabla de
     * control anulada.
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

        if (cab.ide_cpcfa != null) {
            await this.documentosCxPSaveService.anularDocumento({ ...dtoIn, ide_cpcfa: cab.ide_cpcfa });
        }

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

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADO
    // ─────────────────────────────────────────────────────────────────────────

    /** UPDATE de cxc_transporte_factura (el envío) tras vincularlo a una factura: mismo campo
     * (total_flete_real_cctfa) que usa el flujo de un solo envío para el "valor real" del flete
     * - acá es el valor que le corresponde a ESE envío dentro de la factura consolidada, no el
     * total de la factura completa. base_flete_real_cctfa/valor_iva_flete_real_cctfa no se
     * pueden reconstruir de forma confiable a este nivel de detalle y quedan sin tocar. */
    private buildActualizarEnvioQuery(
        envio: { ide_cctfa: number; valor: number },
        ideCpcfa: number,
        dtoIn: HeaderParamsDto,
    ): UpdateQuery {
        const updEnvio = new UpdateQuery('cxc_transporte_factura', 'ide_cctfa', dtoIn);
        updEnvio.values.set('ide_cpcfa', ideCpcfa);
        updEnvio.values.set('total_flete_real_cctfa', envio.valor);
        updEnvio.values.set('fecha_actua', getCurrentDate());
        updEnvio.values.set('hora_actua', getCurrentTime());
        updEnvio.where = `ide_cctfa = $1`;
        updEnvio.addIntParam(1, envio.ide_cctfa);
        return updEnvio;
    }

    /** Busca el ide_teclb (movimiento de tesorería) que ya existía detrás de un anticipo, sin
     * modificar nada - se usa cuando el anticipo se reutiliza vía
     * DocumentosCxPSaveService.saveDocumento (que ya vincula la cabecera del anticipo a la
     * factura por su cuenta), así el grupo de flete consolidado también puede marcarse pagado
     * de una con el mismo movimiento. */
    private async buscarTeclbDeAnticipo(ideCpctrAnticipo: number): Promise<number | null> {
        const q = new SelectQuery(
            `SELECT DISTINCT ide_teclb FROM cxp_detall_transa WHERE ide_cpctr = $1 AND ide_teclb IS NOT NULL LIMIT 1`,
        );
        q.addIntParam(1, ideCpctrAnticipo);
        const row = await this.dataSource.createSingleQuery(q);
        return row ? Number(row.ide_teclb) : null;
    }

    /** Vincula un anticipo YA PAGADO (cxp_cabece_transa.ide_cpcfa IS NULL) a una factura que se
     * está asociando directamente (sin pasar por DocumentosCxPSaveService.saveDocumento, que es
     * solo para crear documentos nuevos) y devuelve su ide_teclb. Misma validación de propiedad
     * que DocumentosCxPSaveService.resolverCabeceraTransaccion. */
    private async asociarAnticipoExistente(
        ideCpctrAnticipo: number,
        ideGeper: number,
        ideCpcfa: number,
    ): Promise<number | null> {
        const qAnticipo = new SelectQuery(
            `SELECT ide_cpctr FROM cxp_cabece_transa WHERE ide_cpctr = $1 AND ide_geper = $2 AND ide_cpcfa IS NULL`,
        );
        qAnticipo.addIntParam(1, ideCpctrAnticipo);
        qAnticipo.addIntParam(2, ideGeper);
        const anticipo = await this.dataSource.createSingleQuery(qAnticipo);
        if (!anticipo) {
            throw new BadRequestException(
                `El anticipo ide_cpctr=${ideCpctrAnticipo} no existe, no pertenece a este proveedor o ya está asociado a un documento.`,
            );
        }
        await this.dataSource.pool.query(
            `UPDATE cxp_cabece_transa SET ide_cpcfa = $1 WHERE ide_cpctr = $2`,
            [ideCpcfa, ideCpctrAnticipo],
        );
        return this.buscarTeclbDeAnticipo(ideCpctrAnticipo);
    }
}
