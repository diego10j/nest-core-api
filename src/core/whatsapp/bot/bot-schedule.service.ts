import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { nowGuayaquil } from 'src/util/helpers/date-util';

import { YcloudMetricsService } from '../ycloud/ycloud-metrics.service';

import { BotConfigService } from './bot-config.service';
import { BotDebounceService } from './bot-debounce.service';
import { BotSessionService } from './bot-session.service';
import { BotService } from './bot.service';

// El cliente avisa explícitamente que va a seguir escribiendo (típicamente antes de
// copiar/pegar datos de facturación desde otra app, lo que tarda más que un mensaje
// normal) — si el último mensaje del buffer matchea esto, se extiende la espera del
// debounce en vez de procesar ya (ver procesarBufferReducido). Caso real detectado
// 2026-09-16: "Le envío lap datos" seguido, segundos después, del membrete de la
// empresa — el debounce cerró la cotización antes de que llegara ese bloque.
const REGEX_AVISO_CONTINUACION =
  /\b(le\s+env[ií]o|te\s+env[ií]o|ya\s+te\s+(paso|env[ií]o|mando)|ahi\s+te\s+(paso|mando|env[ií]o)|voy\s+a\s+enviar|dame\s+un\s+(momento|segundo|seg)|un\s+momento|espera(me)?)\b/i;

@Injectable()
export class BotScheduleService {
  private readonly logger = new Logger(BotScheduleService.name);

  // Cota inferior conservadora para candidatos del debounce de mensajes reducidos — el
  // corte real por cuenta (wha_bot_config.segundos_espera_whbco) se aplica después.
  private readonly MIN_ESPERA_REDUCIDO_SEG = 3;

  // Tope de veces que se extiende la espera de un mismo chat por "aviso de continuación"
  // (ver REGEX_AVISO_CONTINUACION) antes de procesarlo de todos modos — evita posponer
  // indefinidamente si el cliente sigue escribiendo mensajes de ese tipo sin llegar nunca
  // al dato real.
  private readonly MAX_EXTENSIONES_REDUCIDO = 2;

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly botConfig: BotConfigService,
    private readonly metricsService: YcloudMetricsService,
    private readonly botService: BotService,
    private readonly botSession: BotSessionService,
    private readonly botDebounce: BotDebounceService,
  ) {}

  /**
   * Cada minuto evalúa si las cuentas deben activar o desactivar el bot por horario.
   * Solo actúa cuando detecta un cambio de estado (evita spam en el log).
   * Solo corre en producción (MODE=PROD) — en DEV el horario automático está deshabilitado.
   */
  @Cron('0 * * * * *')
  async evaluarHorarioBot(): Promise<void> {
    if (envs.mode !== 'PROD') return;
    try {
      const configs = await this.botConfig.getAllConfigsConHorario();
      for (const cfg of configs) {
        const enHorario = await this.botConfig.estaEnHorario(cfg.ide_tihor);
        await this.botConfig.setActivoPorHorario(cfg.ide_whcue, enHorario);
      }
    } catch (error) {
      this.logger.error(`Error en evaluarHorarioBot: ${error.message}`);
    }
  }

  /**
   * Cada minuto (a los 30s) busca sesiones de bot activas con más de 20 min sin respuesta
   * del cliente. Envía un mensaje de despedida y deriva el chat a modo ASESOR.
   * ESPERANDO_CONFIRMACION (el bot preguntó el nombre y espera respuesta) faltaba en la
   * lista de estados — sesiones ahí se quedaban activas indefinidamente sin derivar a un
   * asesor (caso real detectado 2026-09-15: sesiones de hasta 61 días en ese estado).
   */
  @Cron('30 * * * * *')
  async verificarInactividad(): Promise<void> {
    try {
      const ttl = BotSessionService.SESSION_TTL_MINUTES;
      const result = await this.dataSource.pool.query<{
        ide_whbse: number;
        ide_whcha: number;
        wa_id_whcha: string;
        phone_number_id_whcha: string;
        ide_whcue: number;
        ide_empr: number;
        nombre_bot: string;
        estado: string;
      }>(`
        SELECT s.ide_whbse, c.ide_whcha, c.wa_id_whcha, c.phone_number_id_whcha,
               cu.ide_whcue, cu.ide_empr,
               COALESCE(bc.nombre_bot, 'QuimIA') AS nombre_bot,
               s.estado
        FROM wha_bot_sesion s
        INNER JOIN wha_chat c ON c.ide_whcha = s.ide_whcha
        INNER JOIN wha_cuenta cu ON cu.ide_whcue = s.ide_whcue AND cu.activo_whcue = TRUE
        LEFT JOIN wha_bot_config bc ON bc.ide_whcue = s.ide_whcue
        WHERE s.activa = TRUE
          AND s.estado = ANY('{ESPERANDO_CONFIRMACION,ATENCION_LIBRE,PREGUNTA_ES_CLIENTE,IDENTIFICACION,
                               DATOS_NUEVO_CLIENTE,SELECCION_PRODUCTOS,SELECCION_MULTIPLE,
                               CONFIRMANDO_PRODUCTO_LOTE,
                               ESPERANDO_CANTIDAD_LOTE,ESPERANDO_USO_LOTE,
                               CONFIRMACION_PRODUCTOS,MODIFICANDO_LISTA,DATOS_ENVIO,DATOS_PAGO,
                               ATENCION_LIBRE_REDUCIDA,RECOPILANDO_COTIZACION_RAPIDA}'::text[])
          AND (NOW() - s.hora_actua) > make_interval(mins => $1)
          AND c.bot_activo_whcha = TRUE
          AND c.bot_modo_whcha = 'BOT'
          AND c.eliminado_whcha = FALSE
      `, [ttl]);

      for (const row of result.rows) {
        try {
          await this.botSession.expirarPorInactividad(row.ide_whbse);
          // Filosofía: minimizar mensajes al cliente — la sesión se deriva a asesor en
          // silencio (solo cambia bot_modo_whcha internamente) en TODOS los estados, sin
          // el aviso de "sesión finalizada por inactividad" al cliente. La notificación
          // push interna al asesor (dentro de derivarAsesor) es suficiente — antes esto
          // solo aplicaba al modo mensajes reducidos, y el flujo completo (ATENCION_LIBRE,
          // DATOS_ENVIO, DATOS_PAGO, etc.) seguía mandando el aviso al cliente.
          await this.botService.derivarAsesor(
            row.wa_id_whcha, row.phone_number_id_whcha,
            row.ide_whcha, row.ide_whcue, row.ide_empr,
            null,
            `Chat derivado a asesor por inactividad de ${ttl} min.`,
          );
          this.logger.log(`[Bot] Inactividad: chat=${row.ide_whcha} → ASESOR`);
        } catch (err) {
          this.logger.error(`[Bot] Inactividad chat=${row.ide_whcha}: ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`[Bot] verificarInactividad: ${err.message}`);
    }
  }

  /**
   * Cada 20s revisa el buffer de mensajes del modo mensajes reducidos (wha_bot_config.
   * reduce_mensajes_whbco) — cuando un chat lleva `segundos_espera_whbco` sin mensajes
   * nuevos, procesa de una sola vez todo lo acumulado en vez de responder mensaje a
   * mensaje. Ver BotDebounceService para el detalle del buffer. OJO: este cron es GLOBAL
   * (todas las cuentas), no por cuenta — si alguna cuenta configura un `segundos_espera_
   * whbco` bajo (el panel permite desde 1s), este intervalo le agrega hasta 20s extra de
   * espera en el peor caso. Mantenerlo como fracción del umbral más CORTO entre todas las
   * cuentas activas, no ajustarlo pensando en una sola cuenta.
   */
  @Cron('*/20 * * * * *')
  async procesarBufferReducido(): Promise<void> {
    try {
      const candidatos = await this.botDebounce.obtenerCandidatos(this.MIN_ESPERA_REDUCIDO_SEG);
      for (const { ideWhcha, ultimoMensajeMs } of candidatos) {
        try {
          const info = (await this.dataSource.pool.query<{
            ide_whcue: number; wa_id_whcha: string; phone_number_id_whcha: string;
            ide_empr: number; bot_activo_whcha: boolean; bot_modo_whcha: string;
          }>(`
            SELECT s.ide_whcue, c.wa_id_whcha, c.phone_number_id_whcha, cu.ide_empr,
                   c.bot_activo_whcha, c.bot_modo_whcha
            FROM wha_bot_sesion s
            INNER JOIN wha_chat c ON c.ide_whcha = s.ide_whcha
            INNER JOIN wha_cuenta cu ON cu.ide_whcue = s.ide_whcue
            WHERE s.ide_whcha = $1 AND s.activa = TRUE
            LIMIT 1
          `, [ideWhcha])).rows[0];

          if (!info) { await this.botDebounce.descartar(ideWhcha); continue; }

          if (!info.bot_activo_whcha || info.bot_modo_whcha !== 'BOT') {
            // Un asesor tomó el chat mientras esperaba el debounce — descartar sin responder.
            await this.botDebounce.descartar(ideWhcha);
            continue;
          }

          const config = await this.botConfig.getConfig(info.ide_whcue);
          const esperaMs = (config?.segundos_espera_whbco ?? 10) * 1000;
          if (Date.now() - ultimoMensajeMs < esperaMs) continue; // aún no le toca a esta cuenta

          // El cliente avisó que viene más (ver REGEX_AVISO_CONTINUACION) y nada llegó
          // todavía — se le da una espera extra en vez de procesar ya, hasta un tope de
          // extensiones para no posponer indefinidamente. Si no matchea, o ya se llegó al
          // tope, el flujo sigue exactamente igual que antes.
          const ultimoTexto = await this.botDebounce.ultimoMensaje(ideWhcha);
          if (ultimoTexto && REGEX_AVISO_CONTINUACION.test(ultimoTexto)) {
            const extensiones = await this.botDebounce.contarExtension(ideWhcha);
            if (extensiones <= this.MAX_EXTENSIONES_REDUCIDO) {
              await this.botDebounce.extenderEspera(ideWhcha);
              this.logger.log(`[Bot][Reducido] Chat=${ideWhcha} avisó continuación ("${ultimoTexto}") — espera extendida (${extensiones}/${this.MAX_EXTENSIONES_REDUCIDO})`);
              continue;
            }
          }

          const textos = await this.botDebounce.reclamarBuffer(ideWhcha);
          if (!textos.length) continue; // otro tick ya lo procesó

          await this.botService.procesarBufferReducido(
            info.wa_id_whcha, info.phone_number_id_whcha, ideWhcha,
            info.ide_whcue, info.ide_empr, textos.join('\n'),
          );
        } catch (err) {
          this.logger.error(`[Bot][Reducido] Error procesando buffer chat=${ideWhcha}: ${err.message}`, err.stack);
        }
      }
    } catch (error) {
      this.logger.error(`Error en procesarBufferReducido: ${error.message}`);
    }
  }

  /**
   * Diariamente a las 00:05 "cierra" las métricas del día anterior para todas las
   * empresas con WhatsApp activo. La fecha se calcula en zona horaria Guayaquil (no
   * UTC) — el servidor corre en UTC en producción, así que un `new Date()` +
   * `toISOString()` calcularía "ayer" según el reloj UTC, que en las horas de la noche
   * ecuatoriana (19:00-23:59) todavía corresponde al día que en Ecuador sigue en curso,
   * no al que ya terminó.
   */
  @Cron('5 0 * * *')
  async generarMetricasDiarias(): Promise<void> {
    this.logger.log('[Metrics] Cron generarMetricasDiarias disparado');
    try {
      const hoyGye = nowGuayaquil().split(' ')[0];
      const ayer = new Date(`${hoyGye}T00:00:00`);
      ayer.setDate(ayer.getDate() - 1);
      const fechaAyer = ayer.toISOString().split('T')[0];

      const empresas = await this.metricsService.dataSource.createSelectQuery(
        new SelectQuery(`
          SELECT DISTINCT ide_empr
          FROM wha_cuenta
          WHERE activo_whcue = TRUE
        `),
      );

      if (!empresas.length) {
        this.logger.warn('[Metrics] No hay empresas con WhatsApp activo (wha_cuenta.activo_whcue) — nada que generar');
        return;
      }

      let ok = 0;
      for (const { ide_empr } of empresas) {
        try {
          await this.metricsService.generateDailyMetrics(ide_empr as number, fechaAyer);
          ok++;
        } catch (err) {
          // No dejar que una empresa con error bloquee a las demás.
          this.logger.error(`[Metrics] Error generando métricas ide_empr=${ide_empr} fecha=${fechaAyer}: ${err.message}`, err.stack);
        }
      }

      this.logger.log(`[Metrics] Métricas diarias generadas para ${ok}/${empresas.length} empresa(s) — fecha: ${fechaAyer}`);
    } catch (error) {
      this.logger.error(`Error en generarMetricasDiarias: ${error.message}`, error.stack);
    }
  }

  /**
   * Cada 15 minutos recalcula (upsert) las métricas del DÍA ACTUAL — sin esto, el
   * dashboard de Métricas YCloud siempre mostraba 0 para "hoy" hasta que corría el cron
   * de medianoche del día SIGUIENTE (generarMetricasDiarias solo cierra el día
   * anterior). No reemplaza ese cron: este solo mantiene "hoy" al día mientras
   * transcurre; generarMetricasDiarias sigue siendo el que la deja fija una vez pasada
   * la medianoche.
   */
  @Cron('*/15 * * * *')
  async actualizarMetricasHoy(): Promise<void> {
    try {
      const hoyGye = nowGuayaquil().split(' ')[0];

      const empresas = await this.metricsService.dataSource.createSelectQuery(
        new SelectQuery(`
          SELECT DISTINCT ide_empr
          FROM wha_cuenta
          WHERE activo_whcue = TRUE
        `),
      );

      for (const { ide_empr } of empresas) {
        try {
          await this.metricsService.generateDailyMetrics(ide_empr as number, hoyGye);
        } catch (err) {
          this.logger.error(`[Metrics] Error actualizando métricas de hoy ide_empr=${ide_empr}: ${err.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error en actualizarMetricasHoy: ${error.message}`);
    }
  }
}
