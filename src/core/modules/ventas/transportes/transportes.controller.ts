import fs from 'node:fs';
import path from 'node:path';

import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { envs } from 'src/config/envs';
import { Public } from 'src/core/auth/decorators/public.decorator';
import { FilesService } from 'src/core/modules/sistema/files/files.service';
import { v4 as uuid } from 'uuid';

import { GetTarifasByTransporteDto } from './dto/get-tarifas-transporte.dto';
import {
    CompletarEnvioDto,
    GetFacturasParaRutaDto,
    GetRutasDto,
    ReenviarGuiaDto,
    SaveEnvioDto,
    SaveRutaDetDto,
    SaveRutaDto,
    SaveTransporteCompletoDto,
    SetActivoTransDto,
} from './dto/save-transporte.dto';
import { TransportesSaveService } from './transportes-save.service';
import { TransportesService } from './transportes.service';
import { Auth } from 'src/core/auth';

const TRANSPORTES_DIR = path.join(envs.pathDrive, 'ventas', 'transportes');
fs.mkdirSync(TRANSPORTES_DIR, { recursive: true });

const IMAGENES_ENVIOS_DIR = path.join(envs.pathDrive, 'ventas', 'envios');
fs.mkdirSync(IMAGENES_ENVIOS_DIR, { recursive: true });

@ApiTags('Ventas-Transportes')
@Controller('ventas/transportes')
export class TransportesController {
    constructor(
        private readonly service: TransportesService,
        private readonly saveService: TransportesSaveService,
        private readonly filesService: FilesService,
    ) { }

    // ─── TRANSPORTE ───────────────────────────────────────────────────────────

    @Get('getTransportes')
    @Auth()
    @ApiOperation({ summary: 'Listar empresas de transporte con paginación y filtros' })
    getTransportes(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getTransportes({ ...h, ...dtoIn });
    }

    @Get('getListDataTransportes')
    @Auth()
    @ApiOperation({ summary: 'Listar transportes activos para combos/selectores' })
    getListDataTransportes(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataTransportes(h);
    }

    @Post('saveTransporteCompleto')
    @Auth()
    @ApiOperation({ summary: 'Crear o actualizar transporte + sus tarifas en una sola operación. Tarifas no incluidas se eliminan.' })
    saveTransporteCompleto(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: SaveTransporteCompletoDto) {
        return this.saveService.saveTransporteCompleto({ ...h, ...dtoIn });
    }

    @Post('setActivoTransporte')
    @Auth()
    @ApiOperation({ summary: 'Activar o desactivar una empresa de transporte' })
    setActivoTransporte(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: SetActivoTransDto) {
        return this.saveService.setActivoTransporte({ ...h, ...dtoIn });
    }

    // ─── TARIFA TRANSPORTE ────────────────────────────────────────────────────

    @Get('getTarifasTransporte')
    @Auth()
    @ApiOperation({ summary: 'Listar tarifas de transporte con paginación y filtros' })
    getTarifasTransporte(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getTarifasTransporte({ ...h, ...dtoIn });
    }

    @Get('getTarifasByTransporte')
    @Auth()
    @ApiOperation({ summary: 'Listar tarifas de un transporte específico por ide_vgtra' })
    getTarifasByTransporte(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: GetTarifasByTransporteDto) {
        return this.service.getTarifasByTransporte({ ...h, ...dtoIn });
    }

    // ─── ESTADO ENVÍO ─────────────────────────────────────────────────────────

    @Get('getEstadosEnvio')
    @Auth()
    @ApiOperation({ summary: 'Listar estados de envío (tabla catálogo)' })
    getEstadosEnvio(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getEstadosEnvio({ ...h, ...dtoIn });
    }

    @Get('getListDataEstadosEnvio')
    @Auth()
    @ApiOperation({ summary: 'Listar estados de envío activos para combos' })
    getListDataEstadosEnvio(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataEstadosEnvio(h);
    }

    // ─── ENVÍO ────────────────────────────────────────────────────────────────

    @Get('getEnvios')
    @Auth()
    @ApiOperation({ summary: 'Listar envíos con paginación y filtros' })
    getEnvios(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getEnvios({ ...h, ...dtoIn });
    }

    @Get('getEnvioById')
    @Auth()
    @ApiOperation({ summary: 'Obtener un envío por ID con todos sus detalles' })
    getEnvioById(@AppHeaders() h: HeaderParamsDto, @Query('ide_cctfa') ide_cctfa: string) {
        return this.service.getEnvioById({ ...h, ide_cctfa: Number(ide_cctfa) });
    }

    @Post('saveEnvio')
    @Auth()
    @ApiOperation({ summary: 'Crear o actualizar un registro de envío' })
    saveEnvio(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: SaveEnvioDto) {
        return this.saveService.saveEnvio({ ...h, ...dtoIn });
    }

    @Post('setActivoEnvio')
    @Auth()
    @ApiOperation({ summary: 'Cambiar estado de un envío (activo = PENDIENTE, inactivo = PROBLEMA)' })
    setActivoEnvio(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: SetActivoTransDto) {
        return this.saveService.setActivoEnvio({ ...h, ...dtoIn });
    }

    @Get('getFacturasSinEnvio')
    @Auth()
    @ApiOperation({ summary: 'Listar facturas que NO tienen registro de envío (retiro en sucursal)' })
    getFacturasSinEnvio(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getFacturasSinEnvio({ ...h, ...dtoIn });
    }

    @Post('completarEnvio')
    @Auth()
    @ApiOperation({ summary: 'Completar envío: actualiza estado + datos según tipo (guía, fechas, fletes reales, observación)' })
    completarEnvio(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: CompletarEnvioDto) {
        return this.saveService.completarEnvio({ ...h, ...dtoIn });
    }

    @Post('reenviarGuia')
    @Auth()
    @ApiOperation({ summary: 'Reenviar guía de envío a otro correo. Requiere que el envío ya haya sido completado y enviado previamente.' })
    reenviarGuia(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: ReenviarGuiaDto) {
        return this.saveService.reenviarGuiaEmail({ ...h, ...dtoIn });
    }

    @Post('uploadImagenEnvio')
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Subir imagen de guía de transporte o evidencia de entrega' })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, IMAGENES_ENVIOS_DIR),
            filename: (_req, file, cb) => {
                const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                cb(null, `${uuid()}.${ext}`);
            },
        }),
    }))
    uploadImagenEnvio(
        @AppHeaders() _h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return { message: 'ok', fileName: file.filename };
    }

    @Public()
    @Get('downloadImagenEnvio/:fileName')
    @ApiOperation({ summary: 'Descargar imagen de guía o evidencia de entrega (público). Soporta ?w=N para thumbnail' })
    async downloadImagenEnvio(
        @Param('fileName') fileName: string,
        @Res() res: any,
        @Query('w') width?: string,
    ) {
        const filePath = path.join(IMAGENES_ENVIOS_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException(`Imagen no encontrada: ${fileName}`);
        }
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const w = width ? parseInt(width, 10) : undefined;
        if (!w) {
            res.sendFile(filePath);
            return;
        }
        return this.filesService.serveOptimizedImage(filePath, res, { width: w });
    }

    // ─── RUTAS ────────────────────────────────────────────────────────────────

    @Get('getRutas')
    @Auth()
    @ApiOperation({ summary: 'Listar rutas diarias con total de paradas. Filtro opcional por rango de fechas (?fechaDesde=&fechaHasta=)' })
    getRutas(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: GetRutasDto) {
        return this.service.getRutas({ ...h, ...dtoIn });
    }

    @Get('getRutaById')
    @Auth()
    @ApiOperation({ summary: 'Obtener una ruta por ID con cabecera y detalle de paradas (joins a factura, envio, transporte)' })
    getRutaById(@AppHeaders() h: HeaderParamsDto, @Query('ide_vgrta') ide_vgrta: string) {
        return this.service.getRutaById({ ...h, ide_vgrta: Number(ide_vgrta) });
    }

    @Get('getFacturasParaRuta')
    @Auth()
    @ApiOperation({ summary: 'Obtener facturas con envío para agregar a una ruta. Filtra por rango de fecha de emisión y tipo de transporte (todas|propio|externo)' })
    getFacturasParaRuta(@AppHeaders() h: HeaderParamsDto, @Query() dtoIn: GetFacturasParaRutaDto) {
        return this.service.getFacturasParaRuta({ ...h, ...dtoIn });
    }

    @Post('saveRuta')
    @Auth()
    @ApiOperation({ summary: 'Crear o actualizar una ruta diaria' })
    saveRuta(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: SaveRutaDto) {
        return this.saveService.saveRuta({ ...h, ...dtoIn });
    }

    @Post('deleteRuta')
    @Auth()
    @ApiOperation({ summary: 'Eliminar una ruta y sus paradas' })
    deleteRuta(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: { ide_vgrta: number }) {
        return this.saveService.deleteRuta({ ...h, ...dtoIn });
    }

    @Post('setActivoRuta')
    @Auth()
    @ApiOperation({ summary: 'Activar o inactivar una ruta' })
    setActivoRuta(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: SetActivoTransDto) {
        return this.saveService.setActivoRuta({ ...h, ...dtoIn });
    }

    @Post('saveRutaDet')
    @Auth()
    @ApiOperation({ summary: 'Crear o actualizar una parada de ruta' })
    saveRutaDet(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: SaveRutaDetDto) {
        return this.saveService.saveRutaDet({ ...h, ...dtoIn });
    }

    @Post('deleteRutaDet')
    @Auth()
    @ApiOperation({ summary: 'Eliminar una parada de ruta' })
    deleteRutaDet(@AppHeaders() h: HeaderParamsDto, @Body() dtoIn: { ide_vgrtd: number }) {
        return this.saveService.deleteRutaDet({ ...h, ...dtoIn });
    }

    // ─── COMBOS ADICIONALES ───────────────────────────────────────────────────

    @Get('getListDataCamiones')
    @Auth()
    @ApiOperation({ summary: 'Listar camiones/vehículos para combos' })
    getListDataCamiones(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataCamiones(h);
    }

    @Get('getListDataProvincias')
    @Auth()
    @ApiOperation({ summary: 'Listar provincias para combos' })
    getListDataProvincias(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataProvincias(h);
    }

    @Get('getTransportesPorDestino')
    @Auth()
    @ApiOperation({ summary: 'Transportes disponibles para provincia/cantón/ciudad. Admite cualquier combinación' })
    getTransportesPorDestino(
        @AppHeaders() h: HeaderParamsDto,
        @Query('ide_geprov') ide_geprov?: string,
        @Query('ide_gecant') ide_gecant?: string,
        @Query('ciudad_vgttr') ciudad_vgttr?: string,
    ) {
        return this.service.getTransportesPorDestino({
            ...h,
            ide_geprov: ide_geprov ? Number(ide_geprov) : undefined,
            ide_gecant: ide_gecant ? Number(ide_gecant) : undefined,
            ciudad_vgttr,
        });
    }

    // ─── LOGO TRANSPORTE ──────────────────────────────────────────────────────

    @Post('uploadLogoTransporte')
    @Auth()
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Subir logo de empresa de transporte. Retorna el nombre del archivo para usar en saveTransporte' })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, TRANSPORTES_DIR),
            filename: (_req, file, cb) => {
                const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                cb(null, `${uuid()}.${ext}`);
            },
        }),
    }))
    uploadLogoTransporte(
        @AppHeaders() _h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return { message: 'ok', logo_vgtra: file.filename };
    }

    @Public()
    @Get('downloadLogoTransporte/:fileName')
    @ApiOperation({ summary: 'Descargar logo de empresa de transporte (público). Soporta ?w=N para thumbnail' })
    async downloadLogoTransporte(
        @Param('fileName') fileName: string,
        @Res() res: any,
        @Query('w') width?: string,
    ) {
        const filePath = path.join(TRANSPORTES_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException(`Logo no encontrado: ${fileName}`);
        }
        // Caché agresiva: nombre de archivo UUID → contenido inmutable
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const w = width ? parseInt(width, 10) : undefined;
        if (!w) {
            res.sendFile(filePath);
            return;
        }
        return this.filesService.serveOptimizedImage(filePath, res, { width: w });
    }
}
