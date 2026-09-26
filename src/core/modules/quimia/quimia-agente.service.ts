import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { BdtConsultaService, CitaDocumento } from '../base-tecnica/bdt-consulta.service';
import { BdtIaService } from '../base-tecnica/bdt-ia.service';
import { BDT_CONFIG, MENSAJE_IA_GENERAL } from '../base-tecnica/constants/base-tecnica.constants';

import { MAX_NOTAS_QUIMIA, NotaQuimia, QuimiaConocimientoService } from './conocimiento/quimia-conocimiento.service';
import { ChatQuimiaDto } from './dto/chat-quimia.dto';
import { convertirCitasEnLinea, convertirNotasEnLinea } from './helpers/citas-en-linea.helper';
import { formatearTextoPlano } from './helpers/texto-plano.helper';
import {
  MARCADOR_ELEGIR_PRODUCTO,
  MARCADOR_NO_ENCONTRADO,
  buildPromptAgente,
  buildPromptIaGeneral,
} from './prompts/quimia.prompt';
import { ContextoHerramientas, QuimiaHerramientasService, TODAS_HERRAMIENTAS_QUIMIA } from './quimia-herramientas.service';
import { QuimiaProductosService } from './quimia-productos.service';
import { CanalQuimia, Emitir, EventoQuimia, OrigenQuimia, RespuestaQuimia, UsuarioQuimia } from './quimia.types';

type UsuarioConOrigen = UsuarioQuimia & { origen?: OrigenQuimia };

/**
 * Asistente QuimIA. Núcleo independiente del canal: recibe la pregunta + el usuario del ERP y emite
 * eventos. El chat web los envía en streaming (NDJSON); la API JSON / Telegram los acumula con
 * `preguntar()` en una RespuestaQuimia.
 *
 * - Documentación técnica → solo tablas bdt_* (vía BdtConsultaService), con citas verificadas.
 * - Datos comerciales (stock, proveedores, compras, precios, clientes) → servicios existentes del ERP.
 */
@Injectable()
export class QuimiaAgenteService {
  private readonly logger = new Logger(QuimiaAgenteService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly ia: BdtIaService,
    private readonly productos: QuimiaProductosService,
    private readonly herramientas: QuimiaHerramientasService,
    private readonly bdtConsulta: BdtConsultaService,
    private readonly conocimiento: QuimiaConocimientoService,
  ) {}

  /** API JSON (Telegram u otros clientes): misma lógica que el chat, respuesta completa. */
  async preguntar(
    dto: ChatQuimiaDto,
    usuario: UsuarioQuimia,
    canal: CanalQuimia,
    origen: OrigenQuimia = {},
  ): Promise<RespuestaQuimia> {
    const r: RespuestaQuimia = {
      texto: '',
      modo: dto.modo ?? 'AGENTE',
      producto: null,
      citas: [],
      documentos: [],
      notas: [],
      archivos: [],
      imagenes: [],
      opciones: [],
      sugerirCambio: null,
      sinRespuesta: false,
      esIa: false,
      error: null,
      ide_bdcon: null,
      textoPlano: '',
    };
    await this.responder(dto, usuario, canal, origen, (e) => {
      switch (e.tipo) {
        case 'producto':
          r.producto = { ide_inarti: e.ide_inarti, nombre: e.nombre };
          break;
        case 'delta':
          r.texto += e.texto;
          break;
        case 'citas':
          r.citas = e.citas;
          break;
        case 'documentos':
          r.documentos = e.documentos;
          break;
        case 'notas':
          r.notas = e.notas;
          break;
        case 'archivos':
          r.archivos = e.archivos;
          break;
        case 'imagenes':
          r.imagenes = e.imagenes;
          break;
        case 'seleccion':
          r.opciones = e.opciones;
          break;
        case 'sugerir_cambio':
          r.sugerirCambio = e.producto;
          break;
        case 'sin_respuesta':
        case 'sin_producto':
          r.sinRespuesta = true;
          break;
        case 'aviso_ia':
          r.esIa = true;
          break;
        case 'error':
          r.error = e.mensaje;
          break;
        case 'fin':
          r.modo = e.modo;
          r.ide_bdcon = e.ide_bdcon;
          break;
        default:
          break;
      }
    });
    r.textoPlano = formatearTextoPlano(r);
    return r;
  }

  async responder(
    dto: ChatQuimiaDto,
    usuario: UsuarioQuimia,
    canal: CanalQuimia,
    origen: OrigenQuimia,
    emitir: Emitir,
  ): Promise<void> {
    // El origen viaja con el usuario hasta el registro de la consulta.
    const u = { ...usuario, origen };
    try {
      if (dto.modo === 'IA_GENERAL') {
        await this.responderIaGeneral(dto, u, canal, emitir);
      } else {
        await this.responderAgente(dto, u, canal, emitir);
      }
    } catch (error) {
      this.logger.error(`QuimIA: ${error?.message}`, error?.stack);
      emitir({ tipo: 'error', mensaje: 'No se pudo procesar la consulta. Intenta nuevamente.' });
      emitir({ tipo: 'fin', modo: dto.modo ?? 'AGENTE', ide_bdcon: null });
    }
  }

  // ------------------------------------------------------------------ agente con herramientas

  private async responderAgente(dto: ChatQuimiaDto, usuario: UsuarioConOrigen, canal: CanalQuimia, emitir: Emitir) {
    let producto = dto.ide_inarti ? await this.productos.getProducto(dto.ide_inarti, usuario.ideEmpr) : null;
    // Con producto activo no se usa la detección tolerante: una palabra parecida no debe interrumpir la
    // conversación con "¿cambio de producto?" (el agente igual puede buscar con buscar_producto).
    const candidatos = await this.productos.detectar(dto.pregunta, usuario.ideEmpr, { tolerante: !producto });
    const eleccion = this.productos.elegir(candidatos);

    if (producto) {
      // La pregunta nombra claramente OTRO producto: se propone el cambio en vez de responder
      // sobre el producto equivocado. Solo con coincidencias fuertes (>= 50% del nombre): una
      // pregunta de clientes o transporte ("¿cuánto debe Laboratorios ABC?") no debe interrumpir
      // por una palabra suelta que se parezca a algún producto.
      const activoMencionado = candidatos.some((c) => c.ide_inarti === producto.ide_inarti);
      const fuertes = this.productos.elegir(candidatos.filter((c) => c.similitud >= 0.5));
      if (!activoMencionado && fuertes.tipo === 'uno') {
        const texto = `Tu pregunta parece ser sobre **${fuertes.producto.nombre}**, no sobre **${producto.nombre}**. ¿Cambio de producto?`;
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'sugerir_cambio', producto: fuertes.producto });
        await this.cerrar(dto, usuario, canal, emitir, { modo: 'SELECCION', ideInarti: producto.ide_inarti, respuesta: texto });
        return;
      }
      if (!activoMencionado && fuertes.tipo === 'varios') {
        const texto = `Tu pregunta menciona otros productos. ¿A cuál te refieres? (o sigue con **${producto.nombre}**)`;
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'seleccion', opciones: fuertes.opciones });
        await this.cerrar(dto, usuario, canal, emitir, { modo: 'SELECCION', ideInarti: producto.ide_inarti, respuesta: texto });
        return;
      }
    } else if (eleccion.tipo === 'varios') {
      const texto = `Encontré **${eleccion.opciones.length} productos** que coinciden. ¿A cuál te refieres?`;
      emitir({ tipo: 'delta', texto });
      emitir({ tipo: 'seleccion', opciones: eleccion.opciones });
      await this.cerrar(dto, usuario, canal, emitir, { modo: 'SELECCION', respuesta: texto });
      return;
    } else if (eleccion.tipo === 'uno') {
      producto = { ide_inarti: eleccion.producto.ide_inarti, nombre: eleccion.producto.nombre };
    }
    // eleccion 'ninguno' sin producto activo: el agente puede usar buscar_producto o responder
    // algo general ("hola", "¿qué puedes hacer?").

    if (producto) emitir({ tipo: 'producto', ...producto });

    const ctx: ContextoHerramientas = {
      usuario,
      pregunta: dto.pregunta,
      producto,
      docsContexto: [],
      documentos: [],
      ultimaBusqueda: [],
      herramientasUsadas: [],
      // Base de conocimiento (notas del equipo): se busca en cada pregunta, relacionadas al producto primero.
      archivos: [],
      imagenes: [],
      notas: await this.conocimiento.buscar(dto.pregunta, usuario.ideEmpr, { ide_inarti: producto?.ide_inarti }),
      emitir,
    };
    const hoy = new Date().toISOString().slice(0, 10);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildPromptAgente({ producto, canal, hoy, notas: ctx.notas }) },
      ...this.historial(dto),
      { role: 'user', content: dto.pregunta },
    ];

    let textoFinal = '';
    let tokensEntrada = 0;
    let tokensSalida = 0;
    let modelo = BDT_CONFIG.MODELO_AGENTE as string;

    for (let vuelta = 0; vuelta < BDT_CONFIG.MAX_VUELTAS_AGENTE; vuelta++) {
      // Si una herramienta fijó el producto, el sistema lo refleja en las vueltas siguientes.
      messages[0] = {
        role: 'system',
        content: buildPromptAgente({ producto: ctx.producto, canal, hoy, notas: ctx.notas }),
      };
      const r = await this.ia.completarConHerramientas(messages, TODAS_HERRAMIENTAS_QUIMIA);
      tokensEntrada += r.tokensEntrada;
      tokensSalida += r.tokensSalida;
      modelo = r.modelo;
      const mensaje = r.mensaje;
      if (!mensaje) break;

      if (mensaje.tool_calls?.length) {
        messages.push(mensaje);
        const resultados = await Promise.all(
          mensaje.tool_calls.map(async (call) => ({
            role: 'tool' as const,
            tool_call_id: call.id,
            content: await this.herramientas.ejecutar(call.function.name, call.function.arguments, ctx),
          })),
        );
        messages.push(...resultados);
        continue;
      }
      textoFinal = (mensaje.content ?? '').trim();
      break;
    }

    if (!textoFinal) {
      textoFinal = 'No pude completar la consulta con la información disponible. Intenta reformular la pregunta.';
    }

    // ---- marcadores
    let sinRespuesta = false;
    if (textoFinal.startsWith(MARCADOR_NO_ENCONTRADO)) {
      sinRespuesta = true;
      textoFinal = textoFinal.slice(MARCADOR_NO_ENCONTRADO.length).trim();
      textoFinal +=
        '\n\n¿Quieres que responda QuimIA con conocimiento técnico general (generado con IA)?';
    }
    // Pedir un archivo no se responde con IA general: si solo se listaron documentos, no hay "sin respuesta".
    const entregoArchivos = ctx.archivos.length > 0 || ctx.imagenes.length > 0;
    if (
      sinRespuesta &&
      (entregoArchivos ||
        (ctx.herramientasUsadas.includes('listar_documentos') && !ctx.herramientasUsadas.includes('consultar_base_tecnica')))
    ) {
      sinRespuesta = false;
      textoFinal = textoFinal.replace(/\n*¿Quieres que responda QuimIA con conocimiento técnico general[^\n]*$/, '').trim();
    }
    let opciones: EventoQuimia | null = null;
    if (textoFinal.startsWith(MARCADOR_ELEGIR_PRODUCTO)) {
      textoFinal = textoFinal.slice(MARCADOR_ELEGIR_PRODUCTO.length).trim();
      if (ctx.ultimaBusqueda.length > 1) {
        opciones = {
          tipo: 'seleccion',
          opciones: ctx.ultimaBusqueda.map((p) => ({
            ide_inarti: p.ide_inarti,
            nombre: p.nombre,
            coincidencia: p.nombre,
            cobertura: 0,
            similitud: 0,
            documentos: p.documentos_tecnicos,
          })),
        };
      }
    }

    // ---- citas [D1 p.2] → chips en línea, verificadas contra los documentos realmente consultados
    const conCitas = convertirCitasEnLinea(textoFinal, (etiquetas) =>
      this.bdtConsulta.resolverCitas(etiquetas, ctx.docsContexto),
    );
    // Links que la IA no debe generar (ej. "sandbox:/archivo.pdf"): se deja solo el texto. Los
    // documentos llegan como tarjetas/botones con su URL real.
    // [N1] → chip de la nota (abre la nota en el chat / se nombra en Telegram).
    const conNotas = convertirNotasEnLinea(conCitas.texto, ctx.notas);
    textoFinal = conNotas.texto.replace(/\[([^\]]+)\]\((?!https?:\/\/|#cita-|#nota-)[^)]*\)/g, '$1');
    const citas: CitaDocumento[] = conCitas.citas;
    // Notas ofrecidas ("Ver nota"): las citadas primero, máximo 5.
    const notas: NotaQuimia[] = [
      ...conNotas.citadas.map((i) => ctx.notas[i]),
      ...ctx.notas.filter((_n, i) => !conNotas.citadas.includes(i)),
    ].slice(0, MAX_NOTAS_QUIMIA);

    emitir({ tipo: 'delta', texto: textoFinal });
    if (citas.length) emitir({ tipo: 'citas', citas });
    if (ctx.documentos.length) emitir({ tipo: 'documentos', documentos: ctx.documentos });
    if (ctx.archivos.length) emitir({ tipo: 'archivos', archivos: ctx.archivos });
    if (ctx.imagenes.length) emitir({ tipo: 'imagenes', imagenes: ctx.imagenes });
    if (notas.length) emitir({ tipo: 'notas', notas });
    if (opciones) emitir(opciones);
    if (sinRespuesta) emitir({ tipo: 'sin_respuesta' });

    await this.cerrar(dto, usuario, canal, emitir, {
      modo: 'AGENTE',
      ideInarti: ctx.producto?.ide_inarti,
      respuesta: textoFinal,
      sinDato: sinRespuesta,
      documentos: [...new Set([...citas.map((c) => c.ide_bddoc), ...ctx.documentos.map((d) => d.ide_bddoc)])],
      citas,
      notas: notas.map((n) => n.ide_cono),
      herramientas: ctx.herramientasUsadas,
      modelo,
      tokensEntrada,
      tokensSalida,
    });
  }

  // ------------------------------------------------------------------ IA general (sin herramientas)

  private async responderIaGeneral(dto: ChatQuimiaDto, usuario: UsuarioConOrigen, canal: CanalQuimia, emitir: Emitir) {
    const producto = dto.ide_inarti ? await this.productos.getProducto(dto.ide_inarti, usuario.ideEmpr) : null;
    let identificacion: string | null = null;
    if (producto) {
      const r = await this.dataSource.pool.query(
        `SELECT STRING_AGG(DISTINCT CONCAT_WS(' · ', NULLIF('CAS ' || cas_bdpfa, 'CAS '), nombre_comercial_bdpfa, grado_bdpfa), '; ') AS ident
           FROM bdt_producto_fabricante WHERE ide_inarti = $1 AND ide_empr = $2`,
        [producto.ide_inarti, usuario.ideEmpr],
      );
      identificacion = r.rows[0]?.ident || null;
      emitir({ tipo: 'producto', ...producto });
    }

    emitir({ tipo: 'aviso_ia' });
    const stream = await this.ia.completarStream([
      { role: 'system', content: buildPromptIaGeneral(producto?.nombre ?? null, identificacion) },
      ...this.historial(dto),
      { role: 'user', content: dto.pregunta },
    ]);

    let texto = '';
    let tokensEntrada = 0;
    let tokensSalida = 0;
    for await (const chunk of stream) {
      const pieza = chunk.choices[0]?.delta?.content || '';
      if (pieza) {
        texto += pieza;
        emitir({ tipo: 'delta', texto: pieza });
      }
      if (chunk.usage) {
        tokensEntrada = chunk.usage.prompt_tokens;
        tokensSalida = chunk.usage.completion_tokens;
      }
    }
    const aviso = `\n\n${MENSAJE_IA_GENERAL}`;
    emitir({ tipo: 'delta', texto: aviso });

    await this.cerrar(dto, usuario, canal, emitir, {
      modo: 'IA_GENERAL',
      ideInarti: producto?.ide_inarti,
      respuesta: texto + aviso,
      modelo: BDT_CONFIG.MODELO_IA_GENERAL,
      tokensEntrada,
      tokensSalida,
    });
  }

  // ------------------------------------------------------------------ apoyo

  private historial(dto: ChatQuimiaDto): OpenAI.ChatCompletionMessageParam[] {
    return (dto.historial ?? [])
      .slice(-BDT_CONFIG.MAX_HISTORIAL_CHAT)
      .map((m) => ({ role: m.role, content: m.contenido.slice(0, 3000) }) as OpenAI.ChatCompletionMessageParam);
  }

  /** Registra la consulta (auditoría, costos, métricas) y emite el evento final. */
  private async cerrar(
    dto: ChatQuimiaDto,
    usuario: UsuarioConOrigen,
    canal: CanalQuimia,
    emitir: Emitir,
    datos: {
      modo: 'AGENTE' | 'IA_GENERAL' | 'SELECCION';
      ideInarti?: number;
      respuesta?: string;
      sinDato?: boolean;
      documentos?: number[];
      citas?: CitaDocumento[];
      notas?: number[];
      herramientas?: string[];
      modelo?: string;
      tokensEntrada?: number;
      tokensSalida?: number;
    },
  ) {
    let ide: number | null = null;
    try {
      const r = await this.dataSource.pool.query(
        `INSERT INTO bdt_consulta (ide_inarti, canal_bdcon, sesion_bdcon, modo_bdcon, pregunta_bdcon, respuesta_bdcon,
                                   documentos_bdcon, citas_bdcon, herramientas_bdcon, sin_dato_bdcon, modelo_ia_bdcon,
                                   tokens_entrada_bdcon, tokens_salida_bdcon, ide_empr, usuario_ingre,
                                   telefono_bdcon, ide_tlusu, entrada_bdcon, ide_qmtra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING ide_bdcon`,
        [
          datos.ideInarti ?? dto.ide_inarti ?? null,
          canal,
          dto.sesion,
          datos.modo,
          dto.pregunta,
          datos.respuesta ?? null,
          datos.documentos?.length ? datos.documentos : null,
          datos.citas?.length ? JSON.stringify(datos.citas) : null,
          datos.herramientas?.length ? datos.herramientas : null,
          datos.sinDato ?? false,
          datos.modelo ?? null,
          datos.tokensEntrada ?? null,
          datos.tokensSalida ?? null,
          usuario.ideEmpr,
          usuario.login,
          usuario.origen?.telefono ?? null,
          usuario.origen?.ide_tlusu ?? null,
          usuario.origen?.entrada ?? 'TEXTO',
          usuario.origen?.ide_qmtra ?? null,
        ],
      );
      ide = r.rows[0].ide_bdcon;
      if (datos.notas?.length) {
        // Aparte: sin scripts/quimia_conocimiento.sql solo se pierde este dato, no la consulta.
        await this.dataSource.pool
          .query(`UPDATE bdt_consulta SET notas_bdcon = $2 WHERE ide_bdcon = $1`, [ide, datos.notas])
          .catch((e) => this.logger.warn(`notas_bdcon: ${e?.message}`));
      }
    } catch (error) {
      // El registro es auditoría: nunca debe romper la respuesta al usuario.
      this.logger.warn(`No se pudo registrar la consulta: ${error?.message}`);
    }
    emitir({ tipo: 'fin', modo: datos.modo, ide_bdcon: ide });
  }

  async calificar(ideBdcon: number, util: boolean, ideEmpr: number) {
    await this.dataSource.pool.query(`UPDATE bdt_consulta SET util_bdcon = $2 WHERE ide_bdcon = $1 AND ide_empr = $3`, [
      ideBdcon,
      util,
      ideEmpr,
    ]);
    return { message: 'ok' };
  }
}
