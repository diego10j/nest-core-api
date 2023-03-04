import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginUserDto, CreateUserDto } from './dto';
import { DataSourceService } from '../core/connection/datasource.service';
import { ColumnasTablaDto } from './../core/connection/dto/columnas-tabla.dto';
export declare class AuthService {
    private readonly userRepository;
    private readonly jwtService;
    private readonly dataSource;
    constructor(userRepository: Repository<User>, jwtService: JwtService, dataSource: DataSourceService);
    create(createUserDto: CreateUserDto): Promise<any>;
    login(loginUserDto: LoginUserDto): Promise<any>;
    test(dto: ColumnasTablaDto): Promise<{
        data: any;
    }>;
    checkAuthStatus(user: User): Promise<{
        token: any;
        id: string;
        email: string;
        password: string;
        fullName: string;
        isActive: boolean;
        roles: string[];
        product: import("../products/entities").Product;
    }>;
    private getJwtToken;
    private handleDBErrors;
}
