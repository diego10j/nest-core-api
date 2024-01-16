import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { SelectQuery, UpdateQuery } from '../connection/helpers';
import { LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces';
import { AuditService } from '../audit/audit.service';
import { ServiceDto } from '../../common/dto/service.dto';
import { EventAudit } from '../audit/enum/event-audit';
import { ConfigService } from '@nestjs/config';
import { ErrorsLoggerService } from '../../errors/errors-logger.service';
import { isDefined } from '../util/helpers/common-util';
import { toTitleCase } from '../util/helpers/string-util';
import { getDateFormatFront } from '../util/helpers/date-util';

@Injectable()
export class AuthService {

    constructor(private readonly dataSource: DataSourceService,
        private readonly audit: AuditService,
        private readonly configService: ConfigService,
        private readonly errorsLoggerService: ErrorsLoggerService,
        private readonly jwtService: JwtService) {
    }

    async login(loginUserDto: LoginUserDto, ip: string) {
        const { password, userName } = loginUserDto;
        const queryUser = new SelectQuery("SELECT ide_usua,uuid FROM sis_usuario WHERE nick_usua = $1 AND activo_usua=true");
        queryUser.addStringParam(1, userName);
        const dataUser = await this.dataSource.createSingleQuery(queryUser);
        if (dataUser) {
            const queryPass = new SelectQuery(`
            SELECT bloqueado_usua,fecha_caduc_usua,fecha_vence_uscl,a.ide_usua,clave_uscl,
            nom_usua,mail_usua,a.ide_empr,nom_perf,a.ide_perf,avatar_usua,perm_util_perf,a.ide_empr,nick_usua,
            (select ide_sucu from sis_usuario_sucursal where ide_usua = a.ide_usua  order by ide_ussu limit 1 ) as ide_sucu,
            (select nom_empr from sis_empresa where ide_empr = a.ide_empr) as nom_empr
            from sis_usuario a 
            inner join sis_usuario_clave b on a.ide_usua=b.ide_usua 
            inner join sis_perfil c on a.ide_perf=c.ide_perf 
            where a.ide_usua=$1 and activo_usua=true 
            and activo_uscl=true
            `);
            queryPass.addIntParam(1, dataUser.ide_usua);
            const dataPass = await this.dataSource.createSingleQuery(queryPass);
            if (dataPass) {
                //Valida si el usuario no esta bloqueado
                if (dataPass.bloqueado_usua === true)
                    throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');
                //TODO: Verifica que el usuario no este caducoado
                //TODO:  Verifica que la clave no haya caducado
                // Verificar contraseña
                if (!bcrypt.compareSync(password, dataPass.clave_uscl)) {
                    //Auditoria
                    this.audit.saveEventoAuditoria(
                        dataUser.ide_usua,
                        EventAudit.LOGIN_ERROR,
                        ip,
                        "Contraseña incorrecta",
                        loginUserDto.device
                    );
                    this.errorsLoggerService.createErrorLog(`Contraseña incorrecta usuario ${dataPass.nick_usua}`);
                    throw new UnauthorizedException('Credenciales no válidas, Contraseña incorrecta');
                }
                else {
                    //valida sucursal del usuario
                    if (!isDefined(dataPass.ide_sucu)) {
                        throw new UnauthorizedException('El usuario no tiene definida una sucursal');
                    }

                    //recupera el menú del usuario
                    const menu = await this.getMenuByRol(dataPass.ide_perf);
                    //recupera fecha último acceso
                    const lastAccess = await this.getLastAccessUser(dataUser.ide_usua);
                    //actualiza estado true a sessiones no cerradas
                    const updateQuery = new UpdateQuery("sis_auditoria_acceso");
                    updateQuery.values.set("fin_auac", true);
                    updateQuery.where = "ide_usua = $1 and ide_acau = $2 and  fin_auac = $3";
                    updateQuery.addNumberParam(1, dataUser.ide_usua);
                    updateQuery.addNumberParam(2, EventAudit.LOGIN_SUCCESS);
                    updateQuery.addBooleanParam(3, false);
                    await this.dataSource.createQuery(updateQuery);
                    //Auditoria
                    this.audit.saveEventoAuditoria(
                        dataUser.ide_usua,
                        EventAudit.LOGIN_SUCCESS,
                        ip,
                        "Iniciar sessión",
                        loginUserDto.device
                    );

                    return {
                        accessToken: this.getJwtToken({ id: dataUser.uuid }),
                        user: {
                            ide_usua: Number.parseInt(dataUser.ide_usua),
                            ide_empr: Number.parseInt(dataPass.ide_empr),
                            ide_sucu: Number.parseInt(dataPass.ide_sucu),
                            ide_perf: Number.parseInt(dataPass.ide_perf),
                            nom_empr: dataPass.nom_empr,
                            perm_util_perf: dataPass.perm_util_perf,
                            nom_perf: toTitleCase(dataPass.nom_perf),
                            id: dataUser.uuid,
                            displayName: toTitleCase(dataPass.nom_usua),
                            email: dataPass.mail_usua,
                            login: dataPass.nick_usua,
                            photoURL: `${this.configService.get('HOST_API')}/assets/images/avatars/${dataPass.avatar_usua}`,
                            phoneNumber: '0983113543',
                            country: 'Ecuador',
                            address: '90210 Broadway Blvd',
                            state: 'California',
                            city: 'San Francisco',
                            zipCode: '94116',
                            about: 'Praesent turpis. Phasellus viverra nulla ut metus varius laoreet. Phasellus tempus.',
                            role: 'admin',
                            isPublic: true,
                            lastAccess,
                            ip,
                            roles: ['user']
                        },
                        menu
                    };
                }
            }
        }
        else {
            throw new UnauthorizedException('Credenciales no válidas, Usuario incorrecto');
        }
    }

    /**
     * Obtener el menu al que tiene acceso el perfil
     * @param ide_perf 
     * @returns 
     */
    public async getMenuByRol(ide_perf: number) {
        const selectQueryMenu = new SelectQuery(`SELECT ide_opci,nom_opci,sis_ide_opci,paquete_opci,
        tipo_opci,a.uuid
        FROM sis_opcion a 
        WHERE a.ide_opci in (select ide_opci from sis_perfil_opcion where ide_perf=$1)
        ORDER BY sis_ide_opci DESC, nom_opci`);
        selectQueryMenu.addNumberParam(1, ide_perf);
        const data = await this.dataSource.createQuery(selectQueryMenu);
        let objStructure = new Array();
        for (let row of data) {
            objStructure.push(this.getMenuItem(row));
        }
        //Forma el arreglo hijos
        let resp = [];
        for (let row of objStructure) {
            const result = objStructure.filter(
                (hijos) => hijos.node === row.data
            );
            if (result.length > 0) {
                let chi = new Array();
                for (let auxFila of result) {
                    chi.push(auxFila);
                }
                row["items"] = chi;
                if (row.node === null) {
                    resp.push(row);
                }
            }
        }
        return resp;
    }

    private getMenuItem(row: any) {
        let objMenu = {};
        objMenu["label"] = row.nom_opci;
        objMenu["data"] = `${row.ide_opci}`;
        objMenu["package"] = row.paquete_opci;
        objMenu["node"] = row.sis_ide_opci;
        objMenu["uuid"] = row.uuid;
        if (row.node !== null) {
            objMenu["path"] = row.tipo_opci;
        } else {
            objMenu["label"] = row.nom_opci;
            objMenu["package"] = row.paquete_opci;
        }
        return objMenu;
    }

    /**
     * Obtener la última fecha de acceso del usuario
     * @param ide_usua 
     * @returns 
     */
    private async getLastAccessUser(ide_usua: number) {
        let lastDate: string = getDateFormatFront(new Date());
        const selectQuery = new SelectQuery(`select fecha_auac,hora_auac from sis_auditoria_acceso where ide_usua=$1 and ide_acau=0
        and ide_auac = (select max(ide_auac) from sis_auditoria_acceso where ide_usua=$2 and ide_acau=0 and fin_auac=true)`);
        selectQuery.addNumberParam(1, ide_usua);
        selectQuery.addNumberParam(2, ide_usua);
        const data = await this.dataSource.createSingleQuery(selectQuery);
        if (data) {
            lastDate = data.fecha_auac + " " + data.hora_auac;
        }
        return lastDate;
    }


    async checkAuthStatus(user: any) {
        return {
            user,
            accessToken: this.getJwtToken({ id: user.uuid })
        };
    }


    private getJwtToken(payload: JwtPayload) {
        const token = this.jwtService.sign(payload);
        return token;
    }

    /**
     * Cierra la sessión del usuario
     * @param serviceDto 
     */
    async logout(serviceDto: ServiceDto) {
        //actualiza estado true a sessiones no cerradas
        const updateQuery = new UpdateQuery("sis_auditoria_acceso");
        updateQuery.values.set("fin_auac", true);
        updateQuery.where = "ide_usua = $1 and ide_acau = $2 and  fin_auac = $3";
        updateQuery.addNumberParam(1, serviceDto.ideUsua);
        updateQuery.addNumberParam(2, EventAudit.LOGOUT);
        updateQuery.addBooleanParam(3, false);
        this.dataSource.createQuery(updateQuery);
        //Auditoria
        this.audit.saveEventoAuditoria(
            serviceDto.ideUsua,
            EventAudit.LOGOUT,
            serviceDto.ip,
            "Cerrar sessión",
            serviceDto.device
        );
        return {
            message: 'ok'
        };
    }

}
