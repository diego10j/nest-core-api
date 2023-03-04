import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { SelectQuery, UpdateQuery } from '../connection/helpers';
import { LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces';
import { AuditService } from '../audit/audit.service';
import { ServiceDto } from '../../common/dto/service.dto';
import { AccessActions } from '../audit/enum/access-actions';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {

    constructor(private readonly dataSource: DataSourceService,
        private readonly audit: AuditService,
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService) {
    }

    async login(loginUserDto: LoginUserDto) {
        const { password, userName } = loginUserDto;
        const queryUser = new SelectQuery("SELECT ide_usua FROM sis_usuario WHERE nick_usua = $1 AND activo_usua=true");
        queryUser.addStringParam(1, userName);
        const dataUser = await this.dataSource.createSingleQuery(queryUser);
        if (dataUser) {
            const queryPass = new SelectQuery(`
            SELECT bloqueado_usua,fecha_caduc_usua,fecha_vence_uscl,a.ide_usua,clave_uscl,
            nom_usua,mail_usua,a.ide_empr,nom_perf,a.ide_perf,avatar_usua,perm_util_perf,a.ide_empr,nick_usua 
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
                    this.audit.saveAccessAudit(
                        dataUser.ide_usua,
                        AccessActions.LOGIN_ERROR,
                        loginUserDto.ip,
                        "Contraseña incorrecta",
                        loginUserDto.device
                    );
                    throw new UnauthorizedException('Credenciales no válidas, Contraseña incorrecta');
                }
                else {
                    //recupera el menú del usuario
                    const menu = await this.getMenuByRol(dataPass.ide_perf);
                    //recupera fecha último acceso
                    const lastAccess = await this.getLastAccessUser(dataUser.ide_usua);
                    //actualiza estado true a sessiones no cerradas
                    const updateQuery = new UpdateQuery("sis_auditoria_acceso");
                    updateQuery.values.set("fin_auac", true);
                    updateQuery.where = "ide_usua = $1 and ide_acau = $2 and  fin_auac = $3";
                    updateQuery.addNumberParam(1, dataUser.ide_usua);
                    updateQuery.addNumberParam(2, AccessActions.LOGIN_SUCCESS);
                    updateQuery.addBooleanParam(3, false);
                    await this.dataSource.createQuery(updateQuery);
                    //Auditoria
                    this.audit.saveAccessAudit(
                        dataUser.ide_usua,
                        AccessActions.LOGIN_SUCCESS,
                        loginUserDto.ip,
                        "Iniciar sessión",
                        loginUserDto.device
                    );

                    return {
                        accessToken: this.getJwtToken({ id: dataUser.ide_usua }),
                        ide_usua: dataUser.ide_usua,
                        ide_empr: dataPass.ide_empr,
                        ide_perf: dataPass.ide_perf,
                        perm_util_perf: dataPass.perm_util_perf,
                        nom_perf: this.dataSource.util.STRING_UTIL.toTitleCase(dataPass.nom_perf),
                        id: '8864c717-587d-472a-929a-8e5f298024da-0',
                        displayName: this.dataSource.util.STRING_UTIL.toTitleCase(dataPass.nom_usua),
                        email: dataPass.mail_usua,
                        login: dataPass.nick_usua,
                        photoURL: `${this.configService.get('HOST_API')}/assets/images/avatars/avatar_default.jpg`, //dataPass.avatar_usua
                        phoneNumber: '0983113543',
                        country: 'Ecuador',
                        address: '90210 Broadway Blvd',
                        state: 'California',
                        city: 'San Francisco',
                        zipCode: '94116',
                        about: 'Praesent turpis. Phasellus viverra nulla ut metus varius laoreet. Phasellus tempus.',
                        role: 'admin',
                        isPublic: true,
                        menu,
                        lastAccess
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
        const selectQueryMenu = new SelectQuery(`SELECT ide_opci,nom_opci,sis_ide_opci,paquete_opci,
        tipo_opci,icono_opci,
        (SELECT count(1) from sis_opcion WHERE sis_ide_opci = a.ide_opci ) as numHijos
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
        const index = this.dataSource.util.getGenericScreen().indexOf(row.tipo_opci);
        if (row.node !== null) {
            if (index === -1) {
                objMenu["path"] = row.tipo_opci;
            } else {
                objMenu["path"] = `${row.tipo_opci}/generic_${row.ide_opci}`;
            }
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
        let lastDate: string = this.dataSource.util.DATE_UTIL.getDateFormatFront(new Date());
        const selectQuery = new SelectQuery(`select fecha_auac,hora_auac from sis_auditoria_acceso where ide_usua=$1 and ide_acau=0
        and ide_auac = (select max(ide_auac) from sis_auditoria_acceso where ide_usua=$2 and ide_acau=0 and fin_auac=true)`);
        selectQuery.addNumberParam(1, ide_usua);
        selectQuery.addNumberParam(2, ide_usua);
        const data = await this.dataSource.createSingleQuery(selectQuery);
        if (data) {
            lastDate = this.dataSource.util.DATE_UTIL.getDateFormatFront(data.fecha_auac) + " " + data.hora_auac;
        }
        return lastDate;
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
        updateQuery.addNumberParam(1, Number(serviceDto.ide_usua));
        updateQuery.addNumberParam(2, AccessActions.LOGOUT);
        updateQuery.addBooleanParam(3, false);
        this.dataSource.createQuery(updateQuery);
        //Auditoria
        this.audit.saveAccessAudit(
            Number(serviceDto.ide_usua),
            AccessActions.LOGOUT,
            serviceDto.ip,
            "Cerrar sessión",
            serviceDto.device
        );

        const queryPass = new SelectQuery(`
            SELECT * from sis_bloqueo where ide_bloq = -100`);
        const res = await this.dataSource.createQueryPG(queryPass);


        return res;
    }

}
