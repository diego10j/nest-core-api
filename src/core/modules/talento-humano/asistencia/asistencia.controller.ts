import { BadRequestException, Body, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AsistenciaService } from './asistencia.service';
import { GetMisMarcacionesDto } from './dto/asistencia.dto';

const uploadBodySchema = {
    schema: {
        type: 'object',
        properties: {
            file: { type: 'string', format: 'binary', description: 'Archivo .dat de marcaciones del biométrico' },
        },
        required: ['file'],
    },
};

@ApiTags('TalentoHumano-Asistencia')
@Controller('talento-humano/asistencia')
export class AsistenciaController {
    constructor(private readonly service: AsistenciaService) { }

    @Get('getMisMarcaciones')
    @ApiOperation({ summary: 'Marcaciones del mes del empleado vinculado al usuario logueado (autoservicio)' })
    getMisMarcaciones(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetMisMarcacionesDto,
    ) {
        return this.service.getMisMarcaciones({ ...headersParams, ...dtoIn });
    }

    @Post('previsualizarCargaMarcaciones')
    @ApiOperation({ summary: 'Previsualiza (sin guardar) la carga de un archivo .dat de marcaciones del biométrico' })
    @ApiConsumes('multipart/form-data')
    @ApiBody(uploadBodySchema)
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
    previsualizarCargaMarcaciones(
        @AppHeaders() _headersParams: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Debe adjuntar un archivo');
        return this.service.previsualizarCargaMarcaciones(file.buffer.toString('utf-8'));
    }

    @Post('confirmarCargaMarcaciones')
    @ApiOperation({ summary: 'Confirma la carga: reemplaza las marcaciones del período cubierto por el archivo' })
    @ApiConsumes('multipart/form-data')
    @ApiBody(uploadBodySchema)
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
    confirmarCargaMarcaciones(
        @AppHeaders() headersParams: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: Record<string, unknown>,
    ) {
        if (!file) throw new BadRequestException('Debe adjuntar un archivo');
        return this.service.confirmarCargaMarcaciones({
            ...headersParams,
            ...(body as object),
            contenido: file.buffer.toString('utf-8'),
        });
    }
}
