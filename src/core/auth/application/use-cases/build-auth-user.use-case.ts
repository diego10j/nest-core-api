import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { fToTitleCase } from '../../../../util/helpers/string-util';
import {
    IUserRepository,
    USER_REPOSITORY,
    IProfileRepository,
    PROFILE_REPOSITORY,
    IBranchRepository,
    BRANCH_REPOSITORY
} from '../../domain/repositories';
import { UserId } from '../../domain/value-objects';
import { AuthUser, EmpresaAuth } from '../../interfaces/auth-user.interface';

/**
 * Use Case: Construir Datos del Usuario Autenticado
 * SRP: Solo se encarga de construir el objeto AuthUser
 */
@Injectable()
export class BuildAuthUserUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        @Inject(PROFILE_REPOSITORY)
        private readonly profileRepository: IProfileRepository,
        @Inject(BRANCH_REPOSITORY)
        private readonly branchRepository: IBranchRepository,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Construye el objeto AuthUser con todos sus datos
     */
    async execute(uuid: string, ip: string, empresaData?: any): Promise<AuthUser> {
        const userId = UserId.create(uuid);

        // Obtener usuario
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        // Obtener perfiles y sucursales en paralelo
        const [perfiles, sucursales] = await Promise.all([
            this.profileRepository.findByUserId(user.ideUsua),
            this.branchRepository.findByUserId(user.ideUsua),
        ]);

        // Validar que tenga perfiles y sucursales
        if (perfiles.length === 0) {
            throw new Error('El usuario no tiene perfiles asignados');
        }
        if (sucursales.length === 0) {
            throw new Error('El usuario no tiene sucursales asignadas');
        }

        const roles = perfiles.map((perf) => perf.ide_perf?.toString()).filter((id) => id != null);

        // Construir empresa (desde datos existentes o parámetro)
        const empresas: EmpresaAuth[] = empresaData ? [{
            ide_empr: Number.parseInt(empresaData.ide_empr),
            nom_empr: empresaData.nom_empr,
            logo_empr: empresaData.logotipo_empr,
            identificacion_empr: empresaData.identificacion_empr,
        }] : [];

        return {
            ide_usua: user.ideUsua,
            id: user.id.value,
            displayName: fToTitleCase(user.displayName),
            email: user.email.value,
            login: user.login,
            photoURL: `${this.configService.get('HOST_API')}/assets/images/avatars/${user.photoURL}`,
            isPublic: user.requirePasswordChange,
            lastAccess: undefined, // Se puede agregar después
            ip,
            requireChange: user.requirePasswordChange,
            isSuperUser: user.isSuperUser,
            perfiles,
            sucursales,
            empresas,
            roles,
        };
    }
}
