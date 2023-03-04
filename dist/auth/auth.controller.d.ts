/// <reference types="express-serve-static-core" />
/// <reference types="passport" />
/// <reference types="multer" />
/// <reference types="node" />
import { IncomingHttpHeaders } from 'http';
import { ColumnsTableDto } from 'src/core/connection/dto/columns-table.dto';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginUserDto } from './dto';
import { User } from './entities/user.entity';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    test(dto: ColumnsTableDto): Promise<{
        data: any;
    }>;
    createUser(createUserDto: CreateUserDto): Promise<{
        token: string;
        id: string;
        email: string;
        password: string;
        fullName: string;
        isActive: boolean;
        roles: string[];
        product: import("../products/entities").Product;
    }>;
    loginUser(loginUserDto: LoginUserDto): Promise<{
        token: string;
        id: string;
        email: string;
        password: string;
        fullName: string;
        isActive: boolean;
        roles: string[];
        product: import("../products/entities").Product;
    }>;
    checkAuthStatus(user: User): Promise<{
        token: string;
        id: string;
        email: string;
        password: string;
        fullName: string;
        isActive: boolean;
        roles: string[];
        product: import("../products/entities").Product;
    }>;
    testingPrivateRoute(request: Express.Request, user: User, userEmail: string, rawHeaders: string[], headers: IncomingHttpHeaders): {
        ok: boolean;
        message: string;
        user: User;
        userEmail: string;
        rawHeaders: string[];
        headers: IncomingHttpHeaders;
    };
    privateRoute2(user: User): {
        ok: boolean;
        user: User;
    };
    privateRoute3(user: User): {
        ok: boolean;
        user: User;
    };
}
