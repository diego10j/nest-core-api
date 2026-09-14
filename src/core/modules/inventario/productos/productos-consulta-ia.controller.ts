import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from 'src/core/auth/decorators/public.decorator';

import { ConsultarIaProductoDto } from './dto/consultar-ia-producto.dto';
import { MAX_PREGUNTAS_CONSULTA_IA, ProductosConsultaIaService } from './productos-consulta-ia.service';

@ApiTags('Inventario-Productos-ConsultaIA')
@Controller('inventario/productos/consulta-ia')
export class ProductosConsultaIaController {
  constructor(private readonly service: ProductosConsultaIaService) { }

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Responder en streaming (NDJSON) una pregunta sobre un producto (chat público del portal, hasta 3 preguntas por sesión, sin persistencia)',
  })
  async consultarIa(@Body() dtoIn: ConsultarIaProductoDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.status(HttpStatus.OK);

    const preguntasRealizadas = this.service.contarPreguntasRealizadas(dtoIn.historial);
    const resultado = await this.service.responder(dtoIn);

    if (resultado.limitReached) {
      res.write(`${JSON.stringify({ delta: resultado.mensaje })}\n`);
      res.write(`${JSON.stringify({ done: true, limitReached: true, preguntasRestantes: 0 })}\n`);
      return res.end();
    }

    for await (const chunk of resultado.stream!) {
      const piece = chunk.choices[0]?.delta?.content || '';
      if (piece) {
        res.write(`${JSON.stringify({ delta: piece })}\n`);
      }
    }

    const preguntasRestantes = Math.max(0, MAX_PREGUNTAS_CONSULTA_IA - (preguntasRealizadas + 1));
    res.write(`${JSON.stringify({ done: true, limitReached: false, preguntasRestantes })}\n`);
    res.end();
  }
}
