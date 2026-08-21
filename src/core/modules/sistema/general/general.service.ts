import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers/select-query';
import { normalizeString } from 'src/util/helpers/sql-util';
import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';

import { GetPersonasDto } from './dto/get-personas.dto';
import { RucDto } from './dto/ruc.dto';
import { SavePersonasDto } from './dto/save-personas.dto';

@Injectable()
export class GeneralService {
    constructor(
        private readonly dataSource: DataSourceService,
    ) { }

    validateCedula(id: string) {
        const valid = validateCedula(id);
        const message = valid === true ? 'Cédula válida' : 'Cédula no válida';
        return { valid, message };
    }

    validateRuc(dtoIn: RucDto) {
        const result = validateRUC(dtoIn.ruc);
        const message = result.isValid === true ? `${result.type} válido` : 'RUC no válido';
        return { valid: result.isValid, message };
    }

    async getPersonas(dtoIn: GetPersonasDto & HeaderParamsDto) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let pIdx = 1;

        conditions.push(`p.ide_empr = $${pIdx++}`);
        params.push(dtoIn.ideEmpr);

        conditions.push(`p.nivel_geper = 'HIJO'`);

        if (dtoIn.esCliente) {
            conditions.push(`p.es_cliente_geper = $${pIdx++}`);
            params.push(dtoIn.esCliente === 'true');
        }

        if (dtoIn.esProveedor) {
            conditions.push(`p.es_proveedo_geper = $${pIdx++}`);
            params.push(dtoIn.esProveedor === 'true');
        }

        if (dtoIn.esEmpleado) {
            conditions.push(`p.es_empleado_geper = $${pIdx++}`);
            params.push(dtoIn.esEmpleado === 'true');
        }

        if (dtoIn.activo) {
            conditions.push(`p.activo_geper = $${pIdx++}`);
            params.push(dtoIn.activo === 'true');
        }

        const query = new SelectQuery(
            `
            SELECT
                p.ide_geper,
                p.uuid,
                p.nom_geper,
                p.identificac_geper,
                p.nombre_compl_geper,
                p.correo_geper,
                p.direccion_geper,
                p.telefono_geper,
                p.movil_geper,
                p.codigo_geper,
                ti.nombre_getid AS tipo_identificacion,
                tp.detalle_getip AS tipo_persona,
                p.es_cliente_geper,
                p.es_proveedo_geper,
                p.es_empleado_geper,
                p.es_contacto_geper,
                p.activo_geper,
                p.fecha_ingre_geper
            FROM gen_persona p
            LEFT JOIN gen_tipo_identifi ti ON p.ide_getid = ti.ide_getid
            LEFT JOIN gen_tipo_persona tp ON p.ide_getip = tp.ide_getip
            WHERE ${conditions.join(' AND ')}
            ORDER BY p.nom_geper
            `,
            dtoIn,
        );

        params.forEach((p, i) => query.addParam(i + 1, p));
        return this.dataSource.createQuery(query, 'gen_persona');
    }

    /**
     * Búsqueda unificada de personas sin filtrar por rol (cliente/proveedor/contacto/empleado/transportista).
     * "Transporte" en este ERP se resuelve siempre a un gen_persona (ven_transporte.ide_geper), por lo que
     * no requiere un buscador propio: se cubre aquí.
     */
    async searchPersona(dto: SearchDto & HeaderParamsDto) {
        if (dto.value === '') {
            return [];
        }

        const normalizedSearchValue = normalizeString(dto.value.trim());
        const sqlSearchValue = `%${normalizedSearchValue}%`;

        const query = new SelectQuery(
            `
        SELECT
            p.ide_geper,
            p.uuid,
            p.identificac_geper,
            p.nom_geper,
            p.correo_geper,
            p.es_cliente_geper,
            p.es_proveedo_geper,
            p.es_empleado_geper,
            p.es_contacto_geper
        FROM
            gen_persona p
        WHERE
            (
                regexp_replace(unaccent(LOWER(p.nom_geper)), '[^a-z0-9]', '', 'g') LIKE $1
                OR regexp_replace(unaccent(LOWER(p.identificac_geper)), '[^a-z0-9]', '', 'g') LIKE $2
            )
            AND p.ide_empr = ${dto.ideEmpr}
            AND p.activo_geper = true
            AND p.nivel_geper = 'HIJO'
        ORDER BY
            p.nom_geper
        LIMIT ${dto.limit}
        `,
            dto,
        );
        query.addStringParam(1, sqlSearchValue);
        query.addStringParam(2, sqlSearchValue);
        return this.dataSource.createSelectQuery(query);
    }

    async savePersonas(dtoIn: SavePersonasDto & HeaderParamsDto) {
        const items = dtoIn.personas;
        if (items.length === 0) {
            return { message: 'ok', updated: 0 };
        }

        const ids = items.map((i) => i.ideGeper);
        const hasCliente = items.some((i) => i.esCliente != null);
        const hasProveedor = items.some((i) => i.esProveedor != null);
        const hasEmpleado = items.some((i) => i.esEmpleado != null);
        const hasActivo = items.some((i) => i.activo != null);

        const setClauses: string[] = [];
        const queryParams: unknown[] = [];
        let pIdx = 0;

        if (hasCliente) {
            const cases: string[] = [];
            for (const item of items) {
                if (item.esCliente != null) {
                    cases.push(`WHEN ide_geper = $${++pIdx} THEN $${++pIdx}::boolean`);
                    queryParams.push(item.ideGeper, item.esCliente);
                }
            }
            setClauses.push(`es_cliente_geper = CASE ${cases.join(' ')} END`);
        }

        if (hasProveedor) {
            const cases: string[] = [];
            for (const item of items) {
                if (item.esProveedor != null) {
                    cases.push(`WHEN ide_geper = $${++pIdx} THEN $${++pIdx}::boolean`);
                    queryParams.push(item.ideGeper, item.esProveedor);
                }
            }
            setClauses.push(`es_proveedo_geper = CASE ${cases.join(' ')} END`);
        }

        if (hasEmpleado) {
            const cases: string[] = [];
            for (const item of items) {
                if (item.esEmpleado != null) {
                    cases.push(`WHEN ide_geper = $${++pIdx} THEN $${++pIdx}::boolean`);
                    queryParams.push(item.ideGeper, item.esEmpleado);
                }
            }
            setClauses.push(`es_empleado_geper = CASE ${cases.join(' ')} END`);
        }

        if (hasActivo) {
            const cases: string[] = [];
            for (const item of items) {
                if (item.activo != null) {
                    cases.push(`WHEN ide_geper = $${++pIdx} THEN $${++pIdx}::boolean`);
                    queryParams.push(item.ideGeper, item.activo);
                }
            }
            setClauses.push(`activo_geper = CASE ${cases.join(' ')} END`);
        }

        setClauses.push(`usuario_actua = $${++pIdx}`);
        queryParams.push(dtoIn.login);
        setClauses.push(`hora_actua = NOW()`);

        // WHERE clause params
        const wherePlaceholders = ids.map((_, i) => `$${++pIdx}`);
        queryParams.push(...ids);

        const sql = `
            UPDATE gen_persona
            SET ${setClauses.join(', ')}
            WHERE ide_geper IN (${wherePlaceholders.join(', ')})
        `;

        await this.dataSource.pool.query(sql, queryParams);
        return { message: 'ok', updated: ids.length };
    }
}
