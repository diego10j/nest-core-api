import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { toTitleCase } from '../../../util/helpers/string-util';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

    constructor(
        private readonly configService: ConfigService,
        private readonly auth: AuthService
    ) {

        super({
            secretOrKey: configService.get('JWT_SECRET'),
            ignoreExpiration: false,  // *
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        });
    }


    async validate(payload: JwtPayload): Promise<any> {

        const { id } = payload;


        const dataUser = await this.auth.getPwUsuario(id);

        const user = {
            ide_usua: Number.parseInt(dataUser.ide_usua),
            empresas: [
                {
                    ide_empr: Number.parseInt(dataUser.ide_empr),
                    nom_empr: dataUser.nom_empr,
                    logo_empr: dataUser.logo_empr
                }
            ],
            // ide_sucu: Number.parseInt(dataUser.ide_sucu),
            // ide_perf: Number.parseInt(dataUser.ide_perf),
            // perm_util_perf: dataUser.perm_util_perf,
            // nom_perf: toTitleCase(dataUser.nom_perf),
            id: dataUser.uuid,
            displayName: toTitleCase(dataUser.nom_usua),
            email: dataUser.mail_usua,
            login: dataUser.nick_usua,
            photoURL: `${this.configService.get('HOST_API')}/assets/images/avatars/${dataUser.avatar_usua}`,
            phoneNumber: '0983113543',
            country: 'Ecuador',
            address: '90210 Broadway Blvd',
            state: 'California',
            city: 'San Francisco',
            zipCode: '94116',
            about: 'Praesent turpis. Phasellus viverra nulla ut metus varius laoreet. Phasellus tempus.',
            role: 'admin',
            isPublic: true,
            lastAccess: dataUser.fecha_auac,
            ip: dataUser.ip_auac,
            roles: ['user']
        }

        if (!dataUser)
            throw new UnauthorizedException('Token no válido')
        else if (dataUser.bloqueado_usua)
            throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');

        return user;
    }

}