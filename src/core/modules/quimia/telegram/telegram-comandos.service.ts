import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { UsuarioQuimia } from '../quimia.types';
import { graficoAPng } from '../reportes/grafico-imagen.helper';
import { CATALOGO_REPORTES, QuimiaReportesService, ResultadoReporte, fechaDeArgumento } from '../reportes/quimia-reportes.service';
import { tablaAPng } from '../reportes/tabla-imagen.helper';

import { TelegramApiService } from './telegram-api.service';
import { CuentaTelegram, TelegramCuentaService } from './telegram-cuenta.service';

/** Comandos propios del bot: no se pueden usar como nombre de un comando configurable. */
export const COMANDOS_RESERVADOS = ['start', 'ayuda', 'help', 'nuevo', 'salir', 'producto', 'settings'];

/** Comandos que todos los números vinculados ven en el menú "/". */
const COMANDOS_BASE = [
  { command: 'ayuda', description: 'Ver ejemplos de preguntas y tus comandos' },
  { command: 'nuevo', description: 'Empezar una conversación nueva' },
  { command: 'producto', description: 'Fijar el producto (ej. /producto acido citrico)' },
];

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ComandoGuardar {
  ide_qmcom?: number;
  ide_tlcue: number;
  comando: string;
  descripcion: string;
  reporte: string;
  parametros: Record<string, unknown>;
  activo: boolean;
}

/**
 * Comandos configurables del bot de Telegram (/ventas, /resumen…): ejecutan un reporte del catálogo
 * sin IA (inmediatos y sin costo). Solo los números con "Puede usar comandos" (tlg_usuario.comandos_tlusu)
 * los ven en el menú "/" y pueden usarlos.
 */
@Injectable()
export class TelegramComandosService {
  private readonly logger = new Logger(TelegramComandosService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly api: TelegramApiService,
    private readonly cuentas: TelegramCuentaService,
    private readonly reportes: QuimiaReportesService,
  ) {}

  catalogo() {
    return CATALOGO_REPORTES;
  }

  // ------------------------------------------------------------------ administración

  async listar(ideTlcue: number, ideEmpr: number) {
    const r = await this.dataSource.pool.query(
      `SELECT c.ide_qmcom, c.comando_qmcom, c.descripcion_qmcom, c.reporte_qmcom, c.parametros_qmcom, c.activo_qmcom,
              c.total_usos_qmcom, c.ultimo_uso_qmcom
         FROM qmi_comando c
        WHERE c.ide_tlcue = $1 AND c.ide_empr = $2
        ORDER BY c.orden_qmcom, c.comando_qmcom`,
      [ideTlcue, ideEmpr],
    );
    return {
      rowCount: r.rows.length,
      rows: r.rows.map((c) => ({ ...c, reporte_nombre: this.reportes.definicion(c.reporte_qmcom)?.nombre ?? c.reporte_qmcom })),
    };
  }

  async guardar(dto: ComandoGuardar, h: HeaderParamsDto) {
    const comando = dto.comando.trim().replace(/^\//, '').toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(comando)) {
      throw new BadRequestException('El comando solo puede tener letras minúsculas, números y "_" (sin espacios), ej. ventas_diarias');
    }
    if (COMANDOS_RESERVADOS.includes(comando)) throw new BadRequestException(`/${comando} es un comando propio del bot`);
    const def = this.reportes.definicion(dto.reporte);
    if (!def) throw new BadRequestException('Reporte no válido');
    const parametros = this.reportes.resolverParametros(dto.reporte, dto.parametros);

    const dup = await this.dataSource.pool.query(
      `SELECT 1 FROM qmi_comando WHERE ide_tlcue = $1 AND comando_qmcom = $2 AND ide_qmcom <> COALESCE($3, 0)`,
      [dto.ide_tlcue, comando, dto.ide_qmcom ?? null],
    );
    if (dup.rows.length) throw new BadRequestException(`Ya existe el comando /${comando}`);

    const client = await this.dataSource.pool.connect();
    let ide = dto.ide_qmcom;
    try {
      await client.query('BEGIN');
      if (ide) {
        await client.query(
          `UPDATE qmi_comando SET comando_qmcom = $2, descripcion_qmcom = $3, reporte_qmcom = $4, parametros_qmcom = $5,
                  activo_qmcom = $6, usuario_actua = $7, fecha_actua = NOW()
            WHERE ide_qmcom = $1 AND ide_empr = $8`,
          [ide, comando, dto.descripcion.trim().slice(0, 200), dto.reporte, JSON.stringify(parametros), dto.activo, h.login, h.ideEmpr],
        );
      } else {
        const r = await client.query(
          `INSERT INTO qmi_comando (ide_tlcue, comando_qmcom, descripcion_qmcom, reporte_qmcom, parametros_qmcom, activo_qmcom,
                                    ide_empr, usuario_ingre)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ide_qmcom`,
          [dto.ide_tlcue, comando, dto.descripcion.trim().slice(0, 200), dto.reporte, JSON.stringify(parametros), dto.activo, h.ideEmpr, h.login],
        );
        ide = r.rows[0].ide_qmcom;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    this.sincronizarMenus(dto.ide_tlcue).catch((e) => this.logger.warn(`Menú de comandos: ${(e as Error).message}`));
    return { message: 'ok', ide_qmcom: ide };
  }

  async setActivo(ideQmcom: number, activo: boolean, h: HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `UPDATE qmi_comando SET activo_qmcom = $2, usuario_actua = $3, fecha_actua = NOW() WHERE ide_qmcom = $1 AND ide_empr = $4
       RETURNING ide_tlcue`,
      [ideQmcom, activo, h.login, h.ideEmpr],
    );
    if (r.rows[0]) this.sincronizarMenus(r.rows[0].ide_tlcue).catch(() => undefined);
    return { message: 'ok' };
  }

  async eliminar(ideQmcom: number, h: HeaderParamsDto) {
    const r = await this.dataSource.pool.query(`DELETE FROM qmi_comando WHERE ide_qmcom = $1 AND ide_empr = $2 RETURNING ide_tlcue`, [
      ideQmcom,
      h.ideEmpr,
    ]);
    if (r.rows[0]) this.sincronizarMenus(r.rows[0].ide_tlcue).catch(() => undefined);
    return { message: 'ok' };
  }

  /** Vista previa del reporte (pantalla de comandos): los mismos bloques que verá en el chat del ERP. */
  async probar(reporte: string, parametros: Record<string, unknown>, h: HeaderParamsDto, ideTlcue?: number) {
    let ideSucu = h.ideSucu;
    if (ideTlcue) {
      // Mismo resultado que en Telegram: con la sucursal de la cuenta del bot.
      const c = await this.dataSource.pool.query(`SELECT ide_sucu FROM tlg_cuenta WHERE ide_tlcue = $1`, [ideTlcue]);
      ideSucu = c.rows[0]?.ide_sucu ?? ideSucu;
    }
    return this.reportes.ejecutar(reporte, parametros, {
      ideEmpr: h.ideEmpr,
      ideSucu,
      ideUsua: h.ideUsua,
      idePerf: h.idePerf,
      login: h.login,
    });
  }

  // ------------------------------------------------------------------ Telegram

  /** Comandos activos que ve un número: todos, si tiene "Puede usar comandos"; si no, ninguno. */
  async comandosDe(ideTlusu: number): Promise<{ comando_qmcom: string; descripcion_qmcom: string }[]> {
    const r = await this.dataSource.pool.query(
      `SELECT c.comando_qmcom, c.descripcion_qmcom
         FROM qmi_comando c JOIN tlg_usuario u ON u.ide_tlcue = c.ide_tlcue
        WHERE u.ide_tlusu = $1 AND u.comandos_tlusu AND u.activo_tlusu AND c.activo_qmcom
        ORDER BY c.orden_qmcom, c.comando_qmcom`,
      [ideTlusu],
    );
    return r.rows;
  }

  /**
   * Menú "/" de cada número vinculado: comandos base + los comandos activos si tiene "Puede usar
   * comandos". Se llama al guardar/activar/eliminar un comando, al editar un número y al vincularlo.
   */
  async sincronizarMenus(ideTlcue: number, soloIdeTlusu?: number) {
    const cuenta = await this.cuentas.getCuentaInterna(ideTlcue);
    await this.api.setMyCommands(cuenta.token, COMANDOS_BASE).catch(() => undefined);
    const r = await this.dataSource.pool.query(
      `SELECT ide_tlusu, chat_id_tlusu, activo_tlusu FROM tlg_usuario
        WHERE ide_tlcue = $1 AND chat_id_tlusu IS NOT NULL AND ($2::int IS NULL OR ide_tlusu = $2)`,
      [ideTlcue, soloIdeTlusu ?? null],
    );
    for (const u of r.rows) {
      const propios = await this.comandosDe(u.ide_tlusu);
      await this.api
        .setMyCommands(
          cuenta.token,
          [...propios.map((c) => ({ command: c.comando_qmcom, description: c.descripcion_qmcom.slice(0, 256) })), ...COMANDOS_BASE],
          Number(u.chat_id_tlusu),
        )
        .catch((e) => this.logger.warn(`Menú del número ${u.ide_tlusu}: ${(e as Error).message}`));
    }
  }

  /**
   * Ejecuta "/comando [número]" desde Telegram. Devuelve false si no es un comando configurado (el
   * bot muestra la ayuda). Sin acceso responde que no tiene permiso.
   */
  async ejecutarDesdeTelegram(
    cuenta: CuentaTelegram,
    numero: { ide_tlusu: number; telefono_tlusu: string },
    chatId: number,
    nombre: string,
    argumento: string,
  ): Promise<boolean> {
    const r = await this.dataSource.pool.query(
      `SELECT c.*, (SELECT u.comandos_tlusu FROM tlg_usuario u WHERE u.ide_tlusu = $3) AS tiene_acceso
         FROM qmi_comando c WHERE c.ide_tlcue = $1 AND c.comando_qmcom = $2`,
      [cuenta.ide_tlcue, nombre.toLowerCase(), numero.ide_tlusu],
    );
    const c = r.rows[0];
    if (!c) return false;
    if (!c.activo_qmcom) {
      await this.api.enviarMensaje(cuenta.token, chatId, `El comando /${c.comando_qmcom} está desactivado.`);
      return true;
    }
    if (!c.tiene_acceso) {
      await this.api.enviarMensaje(cuenta.token, chatId, `⛔ Tu número no tiene habilitados los comandos. Pídelo al administrador.`);
      return true;
    }

    const def = this.reportes.definicion(c.reporte_qmcom);
    // "/ventas 2025", "/resumen 1" → número del parámetro del reporte; "/resumen 25/09/2026" → fecha.
    const valor = argumento.trim().match(/^\d+$/) ? Number(argumento.trim()) : undefined;
    const fecha = valor === undefined ? fechaDeArgumento(argumento) : null;
    if (argumento.trim() && valor === undefined && !fecha) {
      await this.api.enviarMensaje(
        cuenta.token,
        chatId,
        `No entendí "${escapar(argumento.trim())}". Ejemplos: /${c.comando_qmcom} 2025 · /${c.comando_qmcom} 25/09/2026`,
        { html: true },
      );
      return true;
    }
    const usuario: UsuarioQuimia = {
      ideEmpr: cuenta.ide_empr,
      ideSucu: cuenta.ide_sucu ?? 0,
      ideUsua: 0,
      idePerf: 0,
      login: (cuenta.usuario_erp_tlcue || 'TELEGRAM').slice(0, 30),
    };
    const inicio = Date.now();
    await this.api.escribiendo(cuenta.token, chatId);
    let resultado: ResultadoReporte | null = null;
    let error: string | null = null;
    try {
      resultado = await this.reportes.ejecutar(
        c.reporte_qmcom,
        { ...c.parametros_qmcom, ...(def && valor !== undefined ? { [def.argumento]: valor } : {}), ...(fecha ? { fecha } : {}) },
        usuario,
      );
      await this.enviarResultado(cuenta, chatId, resultado);
    } catch (e) {
      error = (e as Error).message;
      this.logger.warn(`/${c.comando_qmcom}: ${error}`);
      await this.api.enviarMensaje(cuenta.token, chatId, `No se pudo generar /${c.comando_qmcom}. Intenta nuevamente.`).catch(() => undefined);
    }

    await this.dataSource.pool
      .query(`UPDATE qmi_comando SET total_usos_qmcom = total_usos_qmcom + 1, ultimo_uso_qmcom = NOW() WHERE ide_qmcom = $1`, [c.ide_qmcom])
      .catch(() => undefined);
    // Registro en las consultas (panel de uso): modo COMANDO, sin costo de IA.
    await this.dataSource.pool
      .query(
        `INSERT INTO bdt_consulta (canal_bdcon, modo_bdcon, pregunta_bdcon, respuesta_bdcon, sin_dato_bdcon, herramientas_bdcon,
                                   ide_empr, usuario_ingre, telefono_bdcon, ide_tlusu, ms_respuesta_bdcon, costo_usd_bdcon)
         VALUES ('TELEGRAM', 'COMANDO', $1, $2, $3, $4, $5, $6, $7, $8, $9, 0)`,
        [
          `/${c.comando_qmcom}${argumento ? ` ${argumento}` : ''}`,
          resultado?.texto ?? error,
          !!error,
          [c.reporte_qmcom],
          cuenta.ide_empr,
          usuario.login,
          numero.telefono_tlusu,
          numero.ide_tlusu,
          Date.now() - inicio,
        ],
      )
      .catch((e) => this.logger.warn(`Registro del comando: ${(e as Error).message}`));
    return true;
  }

  /** Texto del reporte + sus gráficos y tablas anchas como fotos (en el orden del reporte). */
  private async enviarResultado(cuenta: CuentaTelegram, chatId: number, r: ResultadoReporte) {
    let html = r.mensajeHtml;
    if (!html) {
      const [primera, ...resto] = r.texto.split('\n');
      html = `<b>${escapar(primera)}</b>${resto.length ? `\n${escapar(resto.join('\n'))}` : ''}`;
    }
    await this.api.enviarMensaje(cuenta.token, chatId, html.slice(0, 3900), { html: true });
    for (const b of r.bloques) {
      if (b.tipo === 'grafico') {
        const png = await graficoAPng(b);
        await this.api.enviarFoto(cuenta.token, chatId, { buffer: png, nombre: 'grafico.png', mime: 'image/png' }, b.titulo);
      } else if (b.tipo === 'tabla' && b.imagen) {
        const png = await tablaAPng(b);
        await this.api.enviarFoto(cuenta.token, chatId, { buffer: png, nombre: 'tabla.png', mime: 'image/png' }, b.titulo);
      }
    }
  }

  /** Líneas para /ayuda: los comandos del número. */
  async ayudaComandos(ideTlusu: number): Promise<string> {
    const propios = await this.comandosDe(ideTlusu);
    if (!propios.length) return '';
    return ['', '<b>Tus comandos:</b>', ...propios.map((c) => `/${c.comando_qmcom} — ${escapar(c.descripcion_qmcom)}`)].join('\n');
  }
}
