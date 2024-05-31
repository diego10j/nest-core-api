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
import { getDateFormatFront, getDateTimeFormatFront } from '../util/helpers/date-util';

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
            SELECT 
                a.bloqueado_usua,
                a.fecha_caduc_usua,
                fecha_vence_uscl,
                a.ide_usua,
                b.clave_uscl,
                a.nom_usua,
                a.mail_usua,
                a.ide_empr,
                c.nom_perf,
                c.ide_perf,
                a.avatar_usua,
                c.perm_util_perf,
                a.nick_usua,
                d.ide_sucu,
                e.nom_empr,
                f.fecha_auac,
                f.hora_auac
            FROM 
                sis_usuario a 
                INNER JOIN sis_usuario_clave b ON a.ide_usua = b.ide_usua 
                INNER JOIN sis_perfil c ON a.ide_perf = c.ide_perf 
                INNER JOIN (SELECT ide_usua, ide_sucu FROM sis_usuario_sucursal GROUP BY ide_usua, ide_sucu) d ON a.ide_usua = d.ide_usua
                INNER JOIN sis_empresa e ON a.ide_empr = e.ide_empr
                LEFT JOIN (
                    SELECT fecha_auac, hora_auac, ide_usua
                    FROM sis_auditoria_acceso 
                    WHERE ide_acau = 0 
                        AND fin_auac = true
                    ORDER BY ide_auac DESC
                    LIMIT 1
                ) f ON a.ide_usua = f.ide_usua
            WHERE 
                a.ide_usua = $1 
                AND a.activo_usua = true 
                AND b.activo_uscl = true       
            `);
            queryPass.addIntParam(1, dataUser.ide_usua);
            const dataPass = await this.dataSource.createSingleQuery(queryPass);
            if (dataPass) {
                //Valida si el usuario no esta bloqueado
                if (dataPass.bloqueado_usua === true)
                    throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');
                //TODO: Verifica que el usuario no este caducado
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
                    const lastAccess = dataPass.fecha_auac ? dataPass.fecha_auac + " " + dataPass.hora_auac : getDateTimeFormatFront(new Date());
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
    private async getMenuByRol(ide_perf: number) {
        const selectQueryMenu = new SelectQuery(`
        SELECT
            o.ide_opci,
            o.nom_opci,
            o.sis_ide_opci,
            o.paquete_opci,
            o.tipo_opci,
            o.uuid
        FROM
            sis_opcion o
            LEFT JOIN sis_perfil_opcion p ON o.ide_opci = p.ide_opci
        WHERE
            p.ide_perf = $1
        ORDER BY
            sis_ide_opci DESC,
            nom_opci            
        `);
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
