import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly dataSource;
    constructor(configService: ConfigService, dataSource: DataSourceService);
    validate(payload: JwtPayload): Promise<any>;
}
export {};
