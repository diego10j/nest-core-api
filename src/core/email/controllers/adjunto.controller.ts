import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AdjuntoCorreoService } from '../services/adjunto.service';
import { MailService } from '../services/mail.service';

@ApiTags('Email-Adjuntos')
@Controller('adjuntos-correo')
export class AdjuntoCorreoController {
  constructor(
    private readonly adjuntoService: AdjuntoCorreoService,
    private readonly mailService: MailService,
  ) { }

  @Post('upload')
  @ApiOperation({ summary: 'Subir adjunto para correo (plantilla, campaña o cola)' })
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    }),
  )
  async uploadAdjunto(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100MB
        ],
      }),
    )
    archivo: Express.Multer.File,
    @Body() body: { ide_plco?: number; ide_caco?: number; ide_coco?: number },
    @AppHeaders() headersParams: HeaderParamsDto,
  ) {
    const ide_adco = await this.adjuntoService.subirAdjunto(
      archivo,
      {
        ide_plco: body.ide_plco,
        ide_caco: body.ide_caco,
        ide_coco: body.ide_coco,
      },
      headersParams.login,
    );

    return {
      message: 'Archivo subido exitosamente',
      ide_adco,
      nombre: archivo.originalname,
    };
  }

  @Get(':ide_adco/download')
  @ApiOperation({ summary: 'Descargar adjunto por ID' })
  async downloadAdjunto(@Param('ide_adco') ide_adco: number, @Res() res: Response) {
    const archivo = await this.adjuntoService.descargarAdjunto(ide_adco);

    // res.setHeader('Content-Type', archivo.tipoMime);
    //     res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);

    //   return res.send(archivo.buffer);
  }

  @Get('por-referencia')
  @ApiOperation({ summary: 'Listar adjuntos por tipo de referencia (plantilla, campaña, cola)' })
  async getAdjuntosPorReferencia(@Query('tipo') tipo: 'plantilla' | 'campania' | 'cola', @Query('ide') ide: number) {
    return await this.mailService.getAdjuntosPorReferencia(tipo, ide);
  }

  @Delete(':ide_adco')
  @ApiOperation({ summary: 'Eliminar adjunto de correo por ID' })
  async eliminarAdjunto(@Param('ide_adco') ide_adco: number, @AppHeaders() headersParams: HeaderParamsDto) {
    await this.mailService.eliminarAdjunto(ide_adco, headersParams.login);
    return { message: 'Adjunto eliminado exitosamente' };
  }
}
