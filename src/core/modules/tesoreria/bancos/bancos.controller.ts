import fs from 'node:fs';
import path from 'node:path';

import {
    Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { v4 as uuid } from 'uuid';

import { BancosSaveService } from './bancos-save.service';
import { BancosService } from './bancos.service';
import { GetBancosDto } from './dto/get-bancos.dto';
import { GetCuentasBancoDto } from './dto/get-cuentas-banco.dto';
import { SaveBancoDto } from './dto/save-banco.dto';
import { SaveCuentaBancoDto } from './dto/save-cuenta-banco.dto';
import { SetActivoDto } from './dto/set-activo.dto';

const BANCOS_DIR = path.join(envs.pathDrive, 'tesoreria');
fs.mkdirSync(BANCOS_DIR, { recursive: true });

@ApiTags('Tesoreria - Bancos')
@Controller('tesoreria/bancos')
export class BancosController {
    constructor(
        private readonly service: BancosService,
        private readonly saveService: BancosSaveService,
    ) { }

    // ─── BANCOS (tes_banco) ──────────────────────────────────────────────────

    @Get('getBancos')
    @ApiOperation({ summary: 'Listar bancos con paginación y filtros' })
    getBancos(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dto: GetBancosDto,
    ) {
        return this.service.getBancos({ ...h, ...dto });
    }

    @Get('getListDataBancos')
    @ApiOperation({ summary: 'Listar bancos para combos' })
    getListDataBancos(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataBancos(h);
    }

    @Get('getBancoById/:ideTeban')
    @ApiOperation({ summary: 'Obtener banco por ID' })
    getBancoById(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ideTeban', ParseIntPipe) ideTeban: number,
    ) {
        return this.service.getBancoById(ideTeban);
    }

    @Post('saveBanco')
    @ApiOperation({ summary: 'Crear o actualizar un banco' })
    saveBanco(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveBancoDto,
    ) {
        return this.saveService.saveBanco({ ...h, ...dto });
    }

    @Post('uploadFotoBanco/:ideTeban')
    @ApiOperation({ summary: 'Subir foto del banco' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Foto del banco (PNG, JPG, JPEG)',
                },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, BANCOS_DIR),
            filename: (_req, file, cb) => {
                const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                cb(null, `${uuid()}.${ext}`);
            },
        }),
    }))
    async uploadFotoBanco(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideTeban', ParseIntPipe) ideTeban: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.saveService.updateFotoBanco(ideTeban, file.filename, h);
    }

    @Get('downloadFotoBanco/:fileName')
    @ApiOperation({ summary: 'Descargar foto del banco' })
    downloadFotoBanco(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('fileName') fileName: string,
        @Res() res: any,
    ) {
        const filePath = path.join(BANCOS_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Imagen no encontrada');
        }
        res.sendFile(filePath);
    }

    // ─── CUENTAS BANCARIAS (tes_cuenta_banco) ───────────────────────────────

    @Get('getCuentasBanco')
    @ApiOperation({ summary: 'Listar cuentas bancarias con paginación y filtros' })
    getCuentasBanco(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dto: GetCuentasBancoDto,
    ) {
        return this.service.getCuentasBanco({ ...h, ...dto });
    }

    @Get('getListDataCuentasBanco')
    @ApiOperation({ summary: 'Listar cuentas bancarias para combos' })
    getListDataCuentasBanco(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataCuentasBanco(h);
    }

    @Get('getCuentaBancoById/:ideTecba')
    @ApiOperation({ summary: 'Obtener cuenta bancaria por ID' })
    getCuentaBancoById(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ideTecba', ParseIntPipe) ideTecba: number,
    ) {
        return this.service.getCuentaBancoById(ideTecba);
    }

    @Post('saveCuentaBanco')
    @ApiOperation({ summary: 'Crear o actualizar una cuenta bancaria' })
    saveCuentaBanco(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveCuentaBancoDto,
    ) {
        return this.saveService.saveCuentaBanco({ ...h, ...dto });
    }

    @Post('setActivoCuentaBanco')
    @ApiOperation({ summary: 'Activar o desactivar una cuenta bancaria' })
    setActivoCuentaBanco(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SetActivoDto,
    ) {
        return this.saveService.setActivoCuentaBanco({ ...h, ...dto });
    }
}
