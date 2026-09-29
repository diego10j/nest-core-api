import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { AlertasIaService } from '../base-tecnica/alertas-ia.service';
import { BdtConsultaService, CitaDocumento } from '../base-tecnica/bdt-consulta.service';
import { BdtIaService } from '../base-tecnica/bdt-ia.service';
import { BDT_CONFIG, MENSAJE_IA_GENERAL, costoIa } from '../base-tecnica/constants/base-tecnica.constants';

import { MAX_NOTAS_QUIMIA, NotaQuimia, QuimiaConocimientoService } from './conocimiento/quimia-conocimiento.service';
import { ChatQuimiaDto } from './dto/chat-quimia.dto';
import { convertirCitasEnLinea, convertirNotasEnLinea } from './helpers/citas-en-linea.helper';
import {
  esCoincidenciaFuerte,
  esPedidoDocumentoErp,
  esPedidoProforma,
  esPreguntaDePersona,
  esPreguntaFormulacion,
  mencionaVariosProductos,
} from './helpers/detector-producto.helper';
import { sugerenciasSeguimiento } from './helpers/presentacion.helper';
import { formatearTextoPlano } from './helpers/texto-plano.helper';
import {
  MARCADOR_ELEGIR_PRODUCTO,
  MARCADOR_NO_ENCONTRADO,
  buildPromptAgente,
  buildPromptIaGeneral,
} from './prompts/quimia.prompt';
import { ContextoHerramientas, QuimiaHerramientasService, herramientasPara } from './quimia-herramientas.service';
import { QuimiaProductosService } from './quimia-productos.service';
import { CanalQuimia, Emitir, EventoQuimia, OrigenQuimia, ProductoQuimia, RespuestaQuimia, UsuarioQuimia } from './quimia.types';

type UsuarioConOrigen = UsuarioQuimia & { origen?: OrigenQuimia; inicio?: number };

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
    private readonly alertas: AlertasIaService,
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
      opcionesArchivo: [],
      imagenes: [],
      graficos: [],
      borrador: null,
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
        case 'opciones_archivo':
          r.opcionesArchivo = e.archivos;
          break;
        case 'graficos':
          r.graficos = e.graficos;
          break;
        case 'borrador_proforma':
          r.borrador = e.borrador;
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
    const u = { ...usuario, origen, inicio: Date.now() };
    try {
      if (dto.modo === 'IA_GENERAL') {
        await this.responderIaGeneral(dto, u, canal, emitir);
      } else {
        await this.responderAgente(dto, u, canal, emitir);
      }
    } catch (error) {
      this.logger.error(`QuimIA: ${error?.message}`, error?.stack);
      const problema = this.alertas.reportar(error, { ideEmpr: usuario.ideEmpr, origen: `QuimIA (${canal})` });
      emitir({
        tipo: 'error',
        mensaje:
          problema === 'SIN_SALDO'
            ? 'QuimIA no puede responder ahora: la cuenta de OpenAI se quedó sin saldo. Ya se avisó al administrador.'
            : problema === 'API_KEY'
              ? 'QuimIA no puede responder: la API key de OpenAI no es válida. Ya se avisó al administrador.'
              : 'No se pudo procesar la consulta. Intenta nuevamente.',
      });
      emitir({ tipo: 'fin', modo: dto.modo ?? 'AGENTE', ide_bdcon: null });
    }
  }

  // ------------------------------------------------------------------ agente con herramientas

  private async responderAgente(dto: ChatQuimiaDto, usuario: UsuarioConOrigen, canal: CanalQuimia, emitir: Emitir) {
    // Un servicio que quedó como producto activo (conversaciones anteriores al filtro) se ignora.
    // "No es ninguno de esos": se responde sin producto activo ni detección (volvería a ofrecer los mismos);
    // el agente busca por otros nombres sin los descartados, o sugiere un inactivo / "no está en el catálogo".
    const descartados = dto.descartados?.length ? dto.descartados : null;
    let producto =
      dto.ide_inarti && !descartados ? await this.productos.getProducto(dto.ide_inarti, usuario.ideEmpr, { soloProductos: true }) : null;
    // Con producto activo no se usa la detección tolerante: una palabra parecida no debe interrumpir la
    // conversación con "¿cambio de producto?" (el agente igual puede buscar con buscar_producto).
    // "Quiero la factura 1000": es un documento del ERP, no se busca producto en la pregunta.
    const candidatos =
      esPedidoDocumentoErp(dto.pregunta) || descartados
        ? []
        : await this.productos.detectar(dto.pregunta, usuario.ideEmpr, {
            tolerante: !producto,
            preguntaDePersona: esPreguntaDePersona(dto.pregunta),
          });
    const eleccion = this.productos.elegir(candidatos);
    // Formulación ("¿qué % de aceite de jojoba y extracto de avena le pongo a mi jabón con mi base?"): nombra
    // ingredientes a propósito. No se interrumpe con "¿cambio de producto?" y el producto activo (la base) se
    // conserva; el agente consulta la base técnica de cada ingrediente.
    const formulacion = esPreguntaFormulacion(dto.pregunta);
    // Cotización / proforma ("cotiza 5 kg de cera de palma y 5 kg de cera de coco a consumidor final") o
    // varios productos en la misma pregunta: nunca se interrumpe con "¿cambio de producto?" ni "¿a cuál te
    // refieres?"; el agente busca cada producto. Si la pregunta nombra otros productos, el activo no se
    // usa en este turno (en Telegram la conversación lo conserva para las siguientes preguntas).
    const pedidoVarios = esPedidoProforma(dto.pregunta) || mencionaVariosProductos(candidatos);

    if (formulacion) {
      if (!producto && eleccion.tipo === 'uno' && esCoincidenciaFuerte(eleccion.producto)) {
        producto = { ide_inarti: eleccion.producto.ide_inarti, nombre: eleccion.producto.nombre };
      }
    } else if (pedidoVarios) {
      // Un solo producto claro en el pedido ("cotiza 5 kg de cera de palma") → ese; varios → ninguno fijo.
      const unico =
        eleccion.tipo === 'uno' && esCoincidenciaFuerte(eleccion.producto) && !mencionaVariosProductos(candidatos) ? eleccion.producto : null;
      const otros = candidatos.some((c) => !c.conflicto && esCoincidenciaFuerte(c) && c.ide_inarti !== producto?.ide_inarti);
      if (unico) producto = { ide_inarti: unico.ide_inarti, nombre: unico.nombre };
      else if (producto && otros && !candidatos.some((c) => c.ide_inarti === producto.ide_inarti)) producto = null;
    } else if (producto) {
      // La pregunta nombra claramente OTRO producto: se propone el cambio en vez de responder sobre el
      // producto equivocado. El activo cuenta como mencionado solo si está entre los que MÁS cubren la
      // pregunta ("detergente polvo azul" con DETERGENTE 5 KG activo → es el AZUL). Solo coincidencias
      // fuertes interrumpen: "¿cuánto debe Laboratorios ABC?" o "¿a cuánto vendo el saco?" no.
      const principales = eleccion.tipo === 'uno' ? [eleccion.producto] : eleccion.tipo === 'varios' ? eleccion.opciones : [];
      const activoMencionado = principales.some((c) => c.ide_inarti === producto.ide_inarti);
      const fuertes = principales.filter(esCoincidenciaFuerte);
      if (!activoMencionado && fuertes.length === 1 && principales.length === 1) {
        const texto = `Tu pregunta parece ser sobre **${fuertes[0].nombre}**, no sobre **${producto.nombre}**. ¿Cambio de producto?`;
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'sugerir_cambio', producto: fuertes[0] });
        await this.cerrar(dto, usuario, canal, emitir, { modo: 'SELECCION', ideInarti: producto.ide_inarti, respuesta: texto });
        return;
      }
      if (!activoMencionado && fuertes.length >= 1) {
        // Hace falta al menos una coincidencia fuerte para interrumpir, pero se ofrecen TODOS los empatados
        // (hasta 10), los fuertes primero: filtrar solo los fuertes dejaba fuera productos nombrados de verdad
        // ("glucosa" → faltaba GLUCOSA TG X300 y aparecían COCO GLUCOSIDE / POLYGLUCOSIDES).
        const opciones = [...fuertes, ...principales.filter((c) => !fuertes.includes(c))];
        const texto = `Tu pregunta menciona otros productos. ¿A cuál te refieres? (o sigue con **${producto.nombre}**)`;
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'seleccion', opciones });
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
      opcionesArchivo: [],
      imagenes: [],
      // Tablas/indicadores solo en el chat del ERP; Telegram recibe todo en texto.
      bloques: canal === 'ASESOR' ? [] : undefined,
      graficos: [],
      canal,
      telefono: usuario.origen?.telefono ?? null,
      notas: await this.conocimiento.buscar(dto.pregunta, usuario.ideEmpr, { ide_inarti: producto?.ide_inarti }),
      descartados: descartados ?? undefined,
      emitir,
    };
    const situacion = { descartoOpciones: !!descartados, formulacion };
    const hoy = new Date().toISOString().slice(0, 10);
    // Cliente / proveedor fijado en el chat del ERP como contexto de la conversación.
    const persona =
      dto.persona_tipo && dto.persona_id
        ? { tipo: dto.persona_tipo, ide_geper: Number(dto.persona_id), nombre: (dto.persona_nombre ?? '').slice(0, 250) }
        : null;
    if (persona) ctx.personaFijada = persona;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildPromptAgente({ producto, canal, hoy, notas: ctx.notas, persona, ...situacion }) },
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
        content: buildPromptAgente({ producto: ctx.producto, canal, hoy, notas: ctx.notas, persona, ...situacion }),
      };
      const r = await this.ia.completarConHerramientas(messages, herramientasPara(canal));
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
    const entregoArchivos = ctx.archivos.length > 0 || ctx.opcionesArchivo.length > 0 || ctx.imagenes.length > 0;
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
    if (ctx.bloques?.length) emitir({ tipo: 'bloques', bloques: ctx.bloques });
    if (ctx.borrador) emitir({ tipo: 'borrador_proforma', borrador: ctx.borrador });
    // Telegram: los gráficos de reportes llegan como imagen.
    if (!ctx.bloques && ctx.graficos.length) emitir({ tipo: 'graficos', graficos: ctx.graficos });
    if (citas.length) emitir({ tipo: 'citas', citas });
    if (ctx.documentos.length) emitir({ tipo: 'documentos', documentos: ctx.documentos });
    if (ctx.archivos.length) emitir({ tipo: 'archivos', archivos: ctx.archivos });
    if (ctx.opcionesArchivo.length) emitir({ tipo: 'opciones_archivo', archivos: ctx.opcionesArchivo });
    if (ctx.imagenes.length) emitir({ tipo: 'imagenes', imagenes: ctx.imagenes });
    if (notas.length) emitir({ tipo: 'notas', notas });
    if (opciones) emitir(opciones);
    if (sinRespuesta) emitir({ tipo: 'sin_respuesta' });
    if (canal === 'ASESOR' && !opciones && !ctx.opcionesArchivo.length) {
      const sugerencias = sugerenciasSeguimiento(ctx.herramientasUsadas, ctx.producto?.nombre ?? null);
      if (sugerencias.length) emitir({ tipo: 'sugerencias', sugerencias });
    }

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
    emitir({ tipo: 'estado', texto: 'Revisando la documentación técnica de los productos…' });
    const contextoTecnico = await this.contextoTecnicoIaGeneral(dto.pregunta, producto, usuario.ideEmpr);
    const stream = await this.ia.completarStream([
      { role: 'system', content: buildPromptIaGeneral(producto?.nombre ?? null, identificacion, contextoTecnico) },
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

  /**
   * Documentación técnica (base técnica de DIQUIMEC) del producto activo y de los productos del catálogo que
   * nombra la pregunta, para que la respuesta de IA general parta de datos reales (dosis, especificaciones,
   * compatibilidades) y no solo de conocimiento general. Solo consultas SQL (sin costo de IA); recortado para
   * no inflar el prompt.
   */
  private async contextoTecnicoIaGeneral(pregunta: string, producto: ProductoQuimia | null, ideEmpr: number): Promise<string> {
    const MAX_POR_PRODUCTO = 4000;
    const MAX_TOTAL = 14000;
    const candidatos = await this.productos.detectar(pregunta, ideEmpr, { tolerante: false }).catch(() => []);
    const productos = [
      ...(producto ? [producto] : []),
      ...candidatos.filter((c) => !c.conflicto && esCoincidenciaFuerte(c)).map((c) => ({ ide_inarti: c.ide_inarti, nombre: c.nombre })),
    ]
      .filter((p, i, arr) => arr.findIndex((x) => x.ide_inarti === p.ide_inarti) === i)
      .slice(0, 5);
    if (!productos.length) return '';

    const partes = await Promise.all(
      productos.map(async (p) => {
        const r = await this.bdtConsulta.construirContexto(p.ide_inarti, ideEmpr, pregunta, p.nombre).catch(() => null);
        const texto = r?.texto?.trim();
        return texto
          ? `### ${p.nombre}\n${texto.length > MAX_POR_PRODUCTO ? `${texto.slice(0, MAX_POR_PRODUCTO)}… (recortado)` : texto}`
          : `### ${p.nombre}\n(Sin documentación técnica cargada.)`;
      }),
    );
    const todo = partes.join('\n\n');
    return todo.length > MAX_TOTAL ? `${todo.slice(0, MAX_TOTAL)}… (recortado)` : todo;
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
      // Panel de uso: tiempo de respuesta y costo IA (aparte: sin scripts/quimia_comandos.sql no se pierde la consulta).
      const costo = datos.modelo ? costoIa(datos.modelo, datos.tokensEntrada ?? 0, datos.tokensSalida ?? 0) : 0;
      await this.dataSource.pool
        .query(`UPDATE bdt_consulta SET ms_respuesta_bdcon = $2, costo_usd_bdcon = $3 WHERE ide_bdcon = $1`, [
          ide,
          usuario.inicio ? Date.now() - usuario.inicio : null,
          Math.round(costo * 100000) / 100000,
        ])
        .catch(() => undefined);
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
