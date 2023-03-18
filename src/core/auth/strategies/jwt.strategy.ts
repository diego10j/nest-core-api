import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

    constructor(
        private readonly configService: ConfigService,
        private readonly dataSource: DataSourceService
    ) {

        super({
            secretOrKey: configService.get('JWT_SECRET'),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        });
    }


    async validate(payload: JwtPayload): Promise<any> {

        const { id } = payload;

        const queryUser = new SelectQuery(`
        SELECT a.ide_usua,a.ide_empr,a.ide_perf,perm_util_perf, initcap(nom_perf) as nom_perf,uuid as id, initcap(nom_usua) as nom_usua,
        mail_usua as email, nick_usua as login, avatar_usua,bloqueado_usua, 
        (select ide_sucu from sis_usuario_sucursal where ide_usua = a.ide_usua  order by ide_ussu limit 1 ) as ide_sucu,
        (select to_char(fecha_auac,'${this.dataSource.util.DATE_UTIL.FORMAT_DATE_FRONT}')  || ' ' ||hora_auac  from sis_auditoria_acceso 
        where ide_usua=a.ide_usua and ide_acau=0 
        and ide_auac = (select max(ide_auac) from sis_auditoria_acceso where ide_usua=a.ide_usua and ide_acau=0 and fin_auac=true)) as ult_date,
        (select ip_auac  from sis_auditoria_acceso 
        where ide_usua=a.ide_usua and ide_acau=0 
        and ide_auac = (select max(ide_auac) from sis_auditoria_acceso where ide_usua=a.ide_usua and ide_acau=0 and fin_auac=true)) as ip
        from sis_usuario a 
        inner join sis_perfil c on a.ide_perf=c.ide_perf 
        where a.uuid=$1
        `);
        queryUser.addStringParam(1, id);
        const dataUser = await this.dataSource.createSingleQuery(queryUser);

        const user = {
            ide_usua: Number.parseInt(dataUser.ide_usua),
            ide_empr: Number.parseInt(dataUser.ide_empr),
            ide_sucu: Number.parseInt(dataUser.ide_sucu),
            ide_perf: Number.parseInt(dataUser.ide_perf),
            perm_util_perf: dataUser.perm_util_perf,
            nom_perf: this.dataSource.util.STRING_UTIL.toTitleCase(dataUser.nom_perf),
            id: dataUser.uuid,
            displayName: this.dataSource.util.STRING_UTIL.toTitleCase(dataUser.nom_usua),
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
            lastAccess: dataUser.ult_date,
            ip: dataUser.ip,
            roles: ['user']
        }

        if (!dataUser)
            throw new UnauthorizedException('Token no válido')

        if (dataUser.bloqueado_usua)
            throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');

        return user;
    }

}