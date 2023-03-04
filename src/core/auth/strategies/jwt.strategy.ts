import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

    constructor(
        configService: ConfigService,
        private readonly dataSource: DataSourceService
    ) {

        super({
            secretOrKey: configService.get('JWT_SECRET'),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        });
    }


    async validate(payload: JwtPayload): Promise<any> {

        const { id } = payload;
        const user = await this.dataSource.findOneBy("sis_usuario", "ide_usua", Number(id));
        if (!user)
            throw new UnauthorizedException('Token no válido')

        if (user.bloqueado_usua)
            throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');
        if (!user.roles) user.roles = ['user']; //Rol por defecto
        return user;
    }

}