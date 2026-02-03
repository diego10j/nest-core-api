import { Injectable } from '@nestjs/common';

import { isDefined } from '../../util/helpers/common-util';
import { getCurrentDateTime } from '../../util/helpers/date-util';
import { DataSourceService } from '../connection/datasource.service';
import { InsertQuery, UpdateQuery, DeleteQuery, Query, SelectQuery } from '../connection/helpers';

/**
 * Servicio refactorizado para registrar auditoría
 * Responsable únicamente de: crear y guardar registros de auditoria
 * Sigue SRP - una única responsabilidad
 */
@Injectable()
export class AuditLoggerService {
    constructor(private readonly dataSource: DataSourceService) { }

    /**
     * Registra la auditoría basada en el tipo de query
     */
    async log(query: Query): Promise<void> {
        try {
            let activityQuery: InsertQuery | undefined;

            if (query instanceof InsertQuery) {
                activityQuery = this.buildInsertActivity(query);
            } else if (query instanceof UpdateQuery) {
                activityQuery = await this.buildUpdateActivity(query);
            } else if (query instanceof DeleteQuery) {
                activityQuery = this.buildDeleteActivity(query);
            }

            if (activityQuery) {
                // Desactivar auditoría para evitar recursión
                activityQuery.setAudit(false);
                await this.dataSource.createQuery(activityQuery);
            }
        } catch (error) {
            // Log pero no lanzar excepción para no afectar el flujo principal
            console.error('[AuditLoggerService] Error logging activity:', error);
        }
    }

    /**
     * Construye el query de auditoría para INSERT
     */
    private buildInsertActivity(query: InsertQuery): InsertQuery {
        const valuesObject = Object.fromEntries(query.values);

        const activityQuery = new InsertQuery('sis_actividad', 'ide_acti');
        activityQuery.values.set('tabla_acti', query.table);
        activityQuery.values.set('valor_pk_acti', query.values.get(query.primaryKey));
        activityQuery.values.set('nom_acti', 'Registro Creado');
        activityQuery.values.set('ide_actti', 1); // Registro creado
        activityQuery.values.set('ide_actes', 2); // Finalizado
        activityQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
        activityQuery.values.set('activo_acti', true);
        activityQuery.values.set('usuario_ingre', query.values.get('usuario_ingre'));
        activityQuery.values.set('historial_acti', JSON.stringify(valuesObject));

        return activityQuery;
    }

    /**
     * Construye el query de auditoría para UPDATE
     */
    private async buildUpdateActivity(
        query: UpdateQuery,
    ): Promise<InsertQuery | undefined> {
        // Obtener valores previos para comparar
        const previousValues = await this.getPreviousValues(query);

        if (!isDefined(previousValues)) {
            return undefined; // No existe el registro
        }

        // Calcular cambios
        const changes = this.calculateChanges(query, previousValues);

        if (changes.length === 0) {
            return undefined; // No hay cambios
        }

        // Construir query de auditoría
        const activityQuery = new InsertQuery('sis_actividad', 'ide_acti');
        activityQuery.values.set('tabla_acti', query.table);
        activityQuery.values.set('valor_pk_acti', query.valuePrimaryKey);
        activityQuery.values.set('nom_acti', 'Registro Modificado');
        activityQuery.values.set('ide_actti', 2); // Registro modificado
        activityQuery.values.set('ide_actes', 2); // Finalizado
        activityQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
        activityQuery.values.set('activo_acti', true);
        activityQuery.values.set('historial_acti', JSON.stringify(changes));
        activityQuery.values.set('usuario_ingre', query.values.get('usuario_actua'));

        return activityQuery;
    }

    /**
     * Construye el query de auditoría para DELETE
     */
    private buildDeleteActivity(query: DeleteQuery): InsertQuery {
        const activityQuery = new InsertQuery('sis_actividad', 'ide_acti');
        activityQuery.values.set('tabla_acti', query.table);
        activityQuery.values.set('valor_pk_acti', query.ide);
        activityQuery.values.set('nom_acti', 'Registro Eliminado');
        activityQuery.values.set('ide_actti', 3); // Registro eliminado
        activityQuery.values.set('ide_actes', 2); // Finalizado
        activityQuery.values.set('fecha_actividad_acti', getCurrentDateTime());
        activityQuery.values.set('activo_acti', true);
        activityQuery.values.set('usuario_ingre', query.header?.login);

        return activityQuery;
    }

    /**
     * Obtiene los valores previos de un registro para comparar cambios
     */
    private async getPreviousValues(query: UpdateQuery): Promise<any> {
        const keysArray = Array.from(query.values.keys());
        const keysString = keysArray.join(', ');

        const selectQuery = new SelectQuery(
            `SELECT ${keysString} FROM ${query.table} WHERE ${query.primaryKey} = ${query.valuePrimaryKey}`,
        );

        return this.dataSource.createSingleQuery(selectQuery);
    }

    /**
     * Calcula los cambios comparando valores nuevos vs anteriores
     */
    private calculateChanges(query: UpdateQuery, previousValues: any): any[] {
        const changes = [];
        const usuarioActua = query.values.get('usuario_actua');

        for (const [key, newValue] of query.values) {
            // Ignorar campos de sistema
            if (['fecha_actua', 'hora_actua', 'usuario_actua'].includes(key)) {
                continue;
            }

            const previousValue = previousValues[key];

            // Solo registrar si cambió
            if (previousValue !== newValue) {
                changes.push({
                    campo_modificado: key,
                    valor_anterior: previousValue,
                    valor_nuevo: newValue,
                    fecha_cambio: getCurrentDateTime(),
                    usuario_actua: usuarioActua,
                });
            }
        }

        return changes;
    }
}
