import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { ServiceDto } from '../../common/dto/service.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginUserDto: LoginUserDto): Promise<{
        accessToken: string;
        ide_usua: any;
        ide_empr: any;
        ide_perf: any;
        perm_util_perf: any;
        nom_perf: string;
        id: string;
        displayName: string;
        email: any;
        login: any;
        photoURL: string;
        phoneNumber: string;
        country: string;
        address: string;
        state: string;
        city: string;
        zipCode: string;
        about: string;
        role: string;
        isPublic: boolean;
        menu: any[];
        lastAccess: string;
    }>;
    logout(serviceDto: ServiceDto): Promise<import("../connection/interfaces/resultQuery").ResultQuery>;
}
