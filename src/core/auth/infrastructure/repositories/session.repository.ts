import { Injectable } from '@nestjs/common';
import { ISessionRepository } from '../../domain/repositories/session.repository.interface';
import { DataSourceService } from '../../../connection/datasource.service';
import { UpdateQuery } from '../../../connection/helpers';

/**
 * Implementación del repositorio de sesiones
 */
@Injectable()
export class SessionRepository implements ISessionRepository {
    constructor(private readonly dataSource: DataSourceService) { }

    async closeActiveSessions(ideUsua: number, eventType: number): Promise<void> {
        const updateQuery = new UpdateQuery('sis_auditoria_acceso', 'ide_auac');
        updateQuery.values.set('fin_auac', true);
        updateQuery.where = 'ide_usua = $1 and ide_acau = $2 and fin_auac = $3';
        updateQuery.addNumberParam(1, ideUsua);
        updateQuery.addNumberParam(2, eventType);
        updateQuery.addBooleanParam(3, false);
        updateQuery.setAudit(false);

        await this.dataSource.createQuery(updateQuery);
    }
}
