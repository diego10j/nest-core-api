import { Body, Controller, HttpStatus, NotFoundException, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QuimiaConocimientoService } from './conocimiento/quimia-conocimiento.service';
import { BuscarProductosQuimiaDto } from './dto/buscar-productos-quimia.dto';
import { CalificarConsultaDto } from './dto/calificar-consulta.dto';
import { ChatQuimiaDto, PreguntarQuimiaDto } from './dto/chat-quimia.dto';
import { GetNotaQuimiaDto } from './dto/get-nota-quimia.dto';
import { QuimiaAgenteService } from './quimia-agente.service';
import { QuimiaProductosService } from './quimia-productos.service';
import { UsuarioQuimia } from './quimia.types';

const usuarioDe = (h: HeaderParamsDto): UsuarioQuimia => ({
  ideEmpr: h.ideEmpr,
  ideSucu: h.ideSucu,
  ideUsua: h.ideUsua,
  idePerf: h.idePerf,
  login: h.login,
});

@ApiTags('QuimIA')
@Controller('quimia')
export class QuimiaController {
  constructor(
    private readonly agente: QuimiaAgenteService,
    private readonly productos: QuimiaProductosService,
    private readonly conocimiento: QuimiaConocimientoService,
  ) {}

  @Post('chat')
  @ApiOperation({
    summary:
      'Chat QuimIA del ERP (streaming NDJSON por eventos: producto, seleccion, sugerir_cambio, estado, delta, ' +
      'citas, documentos, sin_respuesta, sin_producto, aviso_ia, error, fin).',
  })
  async chat(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ChatQuimiaDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(HttpStatus.OK);

    await this.agente.responder(dtoIn, usuarioDe(headersParams), 'ASESOR', {}, (evento) => {
      if (!res.writableEnded) res.write(`${JSON.stringify(evento)}\n`);
    });
    res.end();
  }

  @Post('preguntar')
  @ApiOperation({
    summary:
      'Misma consulta que el chat pero con respuesta JSON completa (texto, citas, documentos con links, opciones ' +
      'y textoPlano listo para Telegram). Pensado para integraciones como el bot de Telegram.',
  })
  preguntar(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: PreguntarQuimiaDto) {
    return this.agente.preguntar(dtoIn, usuarioDe(headersParams), dtoIn.canal ?? 'API');
  }

  @Post('buscarProductos')
  @ApiOperation({ summary: 'Busca productos del catálogo (selector "Cambiar producto" del chat)' })
  async buscarProductos(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: BuscarProductosQuimiaDto) {
    const rows = await this.productos.buscar(dtoIn.texto ?? '', usuarioDe(headersParams), 20);
    return { rowCount: rows.length, rows };
  }

  @Post('getNota')
  @ApiOperation({ summary: 'Nota de la base de conocimiento ofrecida por QuimIA ("Ver nota"): contenido e imágenes' })
  async getNota(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GetNotaQuimiaDto) {
    const nota = await this.conocimiento.obtener(dtoIn, headersParams.ideEmpr);
    if (!nota) throw new NotFoundException('La nota no existe o fue archivada');
    return nota;
  }

  @Post('calificarConsulta')
  @ApiOperation({ summary: 'Feedback 👍/👎 de una respuesta' })
  calificarConsulta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CalificarConsultaDto) {
    return this.agente.calificar(dtoIn.ide_bdcon, dtoIn.util, headersParams.ideEmpr);
  }
}
