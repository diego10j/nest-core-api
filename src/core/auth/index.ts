/**
 * Auth Module - Exports principales
 * Refactorizado con Clean Architecture, DDD y SOLID
 */

// Module
export { AuthModule } from './auth.module';

// Services
export { AuthService } from './auth.service';
export { PasswordService } from './password.service';

// Application Services
export { TokenService } from './application/services/token.service';
export { SessionService } from './application/services/session.service';

// Use Cases
export { ValidateUserCredentialsUseCase } from './application/use-cases/validate-user-credentials.use-case';
export { BuildAuthUserUseCase } from './application/use-cases/build-auth-user.use-case';
export { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';

// DTOs
export { LoginUserDto } from './dto/login-user.dto';
export { ChangePasswordDto } from './dto/change-password.dto';
export { HorarioLoginDto } from './dto/horario-login.dto';
export { MenuRolDto } from './dto/menu-rol.dto';

// Interfaces
export { AuthUser, EmpresaAuth, PerfilAuth, SucursalAuth } from './interfaces/auth-user.interface';
export { JwtPayload } from './interfaces/jwt-payload.interface';
export { ValidRoles } from './interfaces/valid-roles';

// Decorators
export { Auth } from './decorators/auth.decorator';
export { GetUser } from './decorators/get-user.decorator';
export { RoleProtected } from './decorators/role-protected.decorator';
export { RawHeaders } from './decorators/raw-headers.decorator';

// Guards
export { UserRoleGuard } from './guards/user-role.guard';

// Exceptions
export { UserNotFoundException } from './exceptions/user-not-found.exception';
export { InvalidPasswordException } from './exceptions/invalid-password.exception';

// Domain Layer
export { User } from './domain/entities/user.entity';
export { Email, UserId, Password } from './domain/value-objects';

// Repository Interfaces
export {
    IUserRepository,
    IProfileRepository,
    IBranchRepository,
    ISessionRepository,
    USER_REPOSITORY,
    PROFILE_REPOSITORY,
    BRANCH_REPOSITORY,
    SESSION_REPOSITORY,
} from './domain/repositories';
