import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { encrypt } from './crypto.util';
import { SaveEmisorDto } from './dto/save-emisor.dto';
import { SaveFirmaDto } from './dto/save-firma.dto';
import { ValidateFirmaDto } from './dto/validate-firma.dto';

const FIRMAS_DIR = path.join(envs.pathDrive, 'sri', 'firmas');
fs.mkdirSync(FIRMAS_DIR, { recursive: true });

const EMISOR_TABLE = 'sri_emisor';
const EMISOR_PK = 'ide_sremi';
const EMISOR_BASE = 'emisor';

const FIRMA_TABLE = 'sri_firma_digital';
const FIRMA_PK = 'ide_srfid';
const FIRMA_BASE = 'firma_digital';

@Injectable()
export class ConfiguracionSaveService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    async saveEmisor(dtoIn: SaveEmisorDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_sremi != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideSremi: number;

        const object: Record<string, unknown> = {
            tipoemision_sremi: dtoIn.tipoemision_sremi,
            tiempo_espera_sremi: dtoIn.tiempo_espera_sremi ?? null,
            wsdl_recep_offline_sremi: dtoIn.wsdl_recep_offline_sremi,
            wsdl_autori_offline_sremi: dtoIn.wsdl_autori_offline_sremi,
            ambiente_sremi: dtoIn.ambiente_sremi ?? null,
        };

        if (isUpdate) {
            ideSremi = dtoIn.ide_sremi!;
            object.ide_sremi = ideSremi;
            listQuery.push({
                operation: 'update',
                module: 'sri',
                tableName: EMISOR_BASE,
                primaryKey: EMISOR_PK,
                object,
                condition: `${EMISOR_PK} = ${ideSremi}`,
            });
        } else {
            ideSremi = await this.dataSource.getSeqTable(EMISOR_TABLE, EMISOR_PK, 1, dtoIn.login);
            object.ide_sremi = ideSremi;
            object.ide_empr = dtoIn.ideEmpr;
            object.ide_sucu = dtoIn.ideSucu;
            listQuery.push({
                operation: 'insert',
                module: 'sri',
                tableName: EMISOR_BASE,
                primaryKey: EMISOR_PK,
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_sremi: ideSremi };
    }

    async saveFirma(dtoIn: SaveFirmaDto & HeaderParamsDto) {
        const existing = await this.findFirmaBySucursal(dtoIn.ideSucu);
        const isUpdate = existing != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideSrfid: number;

        const encryptedPassword = encrypt(dtoIn.password_srfid);

        const object: Record<string, unknown> = {
            password_srfid: encryptedPassword,
            nombre_representante_srfid: dtoIn.nombre_representante_srfid ?? null,
            correo_representante_srfid: dtoIn.correo_representante_srfid ?? null,
            disponible_srfid: dtoIn.disponible_srfid ?? true,
        };

        if (dtoIn.fecha_caduca_srfid != null) {
            object.fecha_caduca_srfid = dtoIn.fecha_caduca_srfid;
        }

        if (isUpdate) {
            ideSrfid = existing.ide_srfid;
            object.ide_srfid = ideSrfid;
            listQuery.push({
                operation: 'update',
                module: 'sri',
                tableName: FIRMA_BASE,
                primaryKey: FIRMA_PK,
                object,
                condition: `${FIRMA_PK} = ${ideSrfid}`,
            });
        } else {
            ideSrfid = await this.dataSource.getSeqTable(FIRMA_TABLE, FIRMA_PK, 1, dtoIn.login);
            object.ide_srfid = ideSrfid;
            object.ide_empr = dtoIn.ideEmpr;
            object.ide_sucu = dtoIn.ideSucu;
            object.fecha_ingreso_srfid = new Date();
            object.ruta_srfid = '';
            listQuery.push({
                operation: 'insert',
                module: 'sri',
                tableName: FIRMA_BASE,
                primaryKey: FIRMA_PK,
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_srfid: ideSrfid };
    }

    async uploadFirma(
        file: Express.Multer.File,
        dtoIn: HeaderParamsDto,
    ) {
        const existing = await this.findFirmaBySucursal(dtoIn.ideSucu);
        const isUpdate = existing != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideSrfid: number;

        const object: Record<string, unknown> = {
            ruta_srfid: file.filename,
        };

        if (isUpdate) {
            if (existing.ruta_srfid) {
                const oldPath = this.resolveRutaFirma(existing.ruta_srfid);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            ideSrfid = existing.ide_srfid;
            object.ide_srfid = ideSrfid;
            listQuery.push({
                operation: 'update',
                module: 'sri',
                tableName: FIRMA_BASE,
                primaryKey: FIRMA_PK,
                object,
                condition: `${FIRMA_PK} = ${ideSrfid}`,
            });
        } else {
            ideSrfid = await this.dataSource.getSeqTable(FIRMA_TABLE, FIRMA_PK, 1, dtoIn.login);
            object.ide_srfid = ideSrfid;
            object.ide_empr = dtoIn.ideEmpr;
            object.ide_sucu = dtoIn.ideSucu;
            object.fecha_ingreso_srfid = new Date();
            listQuery.push({
                operation: 'insert',
                module: 'sri',
                tableName: FIRMA_BASE,
                primaryKey: FIRMA_PK,
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_srfid: ideSrfid };
    }

    async validateFirma(dtoIn: ValidateFirmaDto & HeaderParamsDto) {
        const fullPath = this.resolveRutaFirma(dtoIn.ruta_srfid);
        if (!fs.existsSync(fullPath)) {
            throw new BadRequestException(`El archivo de firma no existe: ${fullPath}`);
        }
        const result = await this.validateP12Password(fullPath, dtoIn.password_srfid);
        return result;
    }

    private resolveRutaFirma(ruta: string): string {
        if (ruta.startsWith('/')) return ruta;
        return path.join(FIRMAS_DIR, ruta);
    }

    private async findFirmaBySucursal(ideSucu: number): Promise<{ ide_srfid: number; ruta_srfid: string } | null> {
        const q = new SelectQuery(`
            SELECT ide_srfid, ruta_srfid FROM ${FIRMA_TABLE}
            WHERE ide_sucu = $1
            LIMIT 1
        `);
        q.addIntParam(1, ideSucu);
        return this.dataSource.createSingleQuery(q);
    }

    private async validateP12Password(
        filePath: string,
        password: string,
    ): Promise<{ valid: boolean; expiryDate: Date | null }> {
        return new Promise((resolve) => {
            const child = execFile('openssl', [
                'pkcs12',
                '-in', filePath,
                '-passin', `pass:${password}`,
                '-nokeys',
                '-clcerts',
                '-legacy',
            ], { timeout: 10000 }, (err, stdout) => {
                if (err) {
                    resolve({ valid: false, expiryDate: null });
                    return;
                }

                const x509Child = execFile('openssl', [
                    'x509',
                    '-noout',
                    '-enddate',
                ], { timeout: 5000 }, (x509Err, enddateOut) => {
                    if (x509Err) {
                        resolve({ valid: true, expiryDate: null });
                        return;
                    }
                    const match = enddateOut.match(/notAfter=(.+)/);
                    const expiryDate = match ? new Date(match[1].trim()) : null;
                    resolve({ valid: true, expiryDate });
                });

                x509Child.stdin?.write(stdout);
                x509Child.stdin?.end();
            });
        });
    }
}
