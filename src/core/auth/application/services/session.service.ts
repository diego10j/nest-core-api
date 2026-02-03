import { Inject, Injectable } from '@nestjs/common';

import { AuditService } from '../../../modules/audit/audit.service';
import { EventAudit } from '../../../modules/audit/enum/event-audit';
import { ISessionRepository, SESSION_REPOSITORY } from '../../domain/repositories';

/**
 * Session Service - Responsabilidad Única: Manejo de sesiones
 * SRP: Solo se encarga de gestionar sesiones de usuario
 */
@Injectable()
export class SessionService {
    constructor(
        @Inject(SESSION_REPOSITORY)
        private readonly sessionRepository: ISessionRepository,
        private readonly auditService: AuditService,
    ) { }

    /**
     * Cierra todas las sesiones activas del usuario
     */
    async closeActiveSessions(ideUsua: number): Promise<void> {
        await this.sessionRepository.closeActiveSessions(ideUsua, EventAudit.LOGIN_SUCCESS);
    }

    /**
     * Registra el evento de login exitoso
     */
    async recordLoginSuccess(ideUsua: number, ip: string, device: string = ''): Promise<void> {
        await this.closeActiveSessions(ideUsua);
        this.auditService.saveEventoAuditoria(
            ideUsua,
            EventAudit.LOGIN_SUCCESS,
            ip,
            'Iniciar sessión',
            device,
        );
    }

    /**
     * Registra el evento de logout
     */
    async recordLogout(ideUsua: number, ip: string, device: string = ''): Promise<void> {
        await this.sessionRepository.closeActiveSessions(ideUsua, EventAudit.LOGOUT);
        this.auditService.saveEventoAuditoria(
            ideUsua,
            EventAudit.LOGOUT,
            ip,
            'Cerrar sessión',
            device,
        );
    }

    /**
     * Registra un error de login
     */
    recordLoginError(ideUsua: number, ip: string, reason: string): void {
        this.auditService.saveEventoAuditoria(
            ideUsua,
            EventAudit.LOGIN_ERROR,
            ip,
            reason,
            '',
        );
    }
}
