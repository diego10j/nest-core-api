import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ProductosService } from '../../inventario/productos/productos.service';
import { ProformasService } from '../../proformas/proformas.service';
import { UsuarioQuimia } from '../quimia.types';

/** Tipo/canal/referencia de proforma para Telegram: los mismos del bot de WhatsApp. */
const IDE_CCTPR_TELEGRAM = 3;
const IDE_CCVAP_TELEGRAM = 6;
/** Horas que un borrador puede confirmarse. */
const VIGENCIA_BORRADOR_H = 24;

export interface LineaBorrador {
  ide_inarti: number;
  producto: string;
  cantidad: number;
  unidad: string | null;
  ide_inuni: number | null;
  precio: number | null;
  /** 1 = graba IVA · -1 = no graba (mismo criterio que el formulario de proformas). */
  iva: 1 | -1;
  total: number | null;
  stock: number | null;
  stock_suficiente: boolean | null;
  costo: number | null;
  porcentaje_utilidad: number | null;
  utilidad: number | null;
  origen_precio: 'CONFIGURACION' | 'INDICADO' | 'SIN_PRECIO';
}

export interface BorradorProforma {
  uuid: string;
  cliente: { ide_geper: number; nombre: string; identificacion: string | null; correo: string | null; telefono: string | null };
  lineas: LineaBorrador[];
  observacion: string | null;
  tarifa_iva: number;
  subtotal: number;
  iva: number;
  total: number;
  avisos: string[];
  estado: 'BORRADOR' | 'CREADA' | 'CANCELADA';
  ide_cccpr?: number | null;
  secuencial?: string | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Proforma desde el chat (QuimIA): la IA prepara un BORRADOR (cliente, productos, cantidades y
 * precios según la configuración de precios) y el usuario lo confirma con un botón. Se crea con el
 * guardado estándar del ERP (ProformasService.saveProforma): mismos totales, IVA y utilidad que el
 * formulario. Chat del ERP → usuario logueado; Telegram → usuario/vendedor automático del bot.
 */
@Injectable()
export class QuimiaProformasService {
  private readonly logger = new Logger(QuimiaProformasService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proformas: ProformasService,
    private readonly productos: ProductosService,
  ) {}

  async prepararBorrador(
    args: { ide_geper: number; items: { ide_inarti: number; cantidad: number; precio?: number | null }[]; observacion?: string | null },
    usuario: UsuarioQuimia,
    canal: string,
    telefono: string | null,
  ): Promise<BorradorProforma> {
    if (!args.ide_geper) throw new BadRequestException('Falta el cliente (usa buscar_cliente para obtener ide_geper)');
    if (!args.items?.length) throw new BadRequestException('Faltan los productos y cantidades');

    const cli = await this.dataSource.pool.query(
      `SELECT to_jsonb(p) AS p FROM gen_persona p WHERE p.ide_geper = $1`,
      [args.ide_geper],
    );
    const p = cli.rows[0]?.p;
    if (!p) throw new BadRequestException('El cliente no existe');

    const avisos: string[] = [];
    const lineas: LineaBorrador[] = [];
    let tarifa = 15;
    for (const it of args.items.slice(0, 30)) {
      const cantidad = Number(it.cantidad);
      if (!(cantidad > 0)) throw new BadRequestException('Todas las cantidades deben ser mayores a 0');
      const a = await this.dataSource.pool.query(
        `SELECT a.ide_inarti, a.nombre_inarti, a.iva_inarti, a.ide_inuni, u.siglas_inuni
           FROM inv_articulo a LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni
          WHERE a.ide_inarti = $1 AND a.ide_empr = $2`,
        [it.ide_inarti, usuario.ideEmpr],
      );
      const art = a.rows[0];
      if (!art) throw new BadRequestException(`El producto ${it.ide_inarti} no existe`);
      const conf = await this.proformas.buscarPrecioProducto(art.ide_inarti, cantidad, usuario.ideEmpr, usuario.ideSucu);
      if (conf?.porcentaje_iva) tarifa = Number(conf.porcentaje_iva);
      const indicado = it.precio != null && Number(it.precio) > 0 ? Number(it.precio) : null;
      const precio = indicado ?? (conf ? Number(conf.precio_venta_sin_iva) : null);
      const stock = await this.productos
        .getStock(art.ide_inarti)
        .then((s) => Number(s?.saldo ?? 0))
        .catch(() => null);
      const linea: LineaBorrador = {
        ide_inarti: art.ide_inarti,
        producto: art.nombre_inarti,
        cantidad,
        unidad: art.siglas_inuni ?? null,
        ide_inuni: art.ide_inuni ?? null,
        precio: precio != null ? Math.round(precio * 10000) / 10000 : null,
        iva: Number(art.iva_inarti) === 1 ? 1 : -1,
        total: precio != null ? r2(precio * cantidad) : null,
        stock,
        stock_suficiente: stock == null ? null : stock >= cantidad,
        costo: conf?.costo_promedio != null ? Number(conf.costo_promedio) : null,
        porcentaje_utilidad: conf?.porcentaje_utilidad != null ? Number(conf.porcentaje_utilidad) : null,
        utilidad: conf?.utilidad_neta != null ? Number(conf.utilidad_neta) : null,
        origen_precio: indicado != null ? 'INDICADO' : conf ? 'CONFIGURACION' : 'SIN_PRECIO',
      };
      const u = linea.unidad ? ` ${linea.unidad}` : '';
      if (linea.precio == null) avisos.push(`${linea.producto}: sin precio configurado para ${cantidad}${u} (indica el precio)`);
      if (linea.stock_suficiente === false) avisos.push(`${linea.producto}: stock insuficiente (hay ${linea.stock}${u})`);
      lineas.push(linea);
    }

    const grava = lineas.filter((l) => l.iva === 1).reduce((s, l) => s + (l.total ?? 0), 0);
    const cero = lineas.filter((l) => l.iva !== 1).reduce((s, l) => s + (l.total ?? 0), 0);
    const iva = r2((grava * tarifa) / 100);
    const datos = {
      cliente: {
        ide_geper: Number(p.ide_geper),
        nombre: p.nom_geper,
        identificacion: p.identificac_geper ?? null,
        correo: p.correo_geper ?? null,
        telefono: p.movil_geper || p.telefono_geper || null,
        ide_getid: p.ide_getid ?? null,
        ide_vgven: p.ide_vgven ?? null,
        direccion: p.direccion_geper ?? null,
      },
      lineas,
      observacion: args.observacion?.trim() || null,
      tarifa_iva: tarifa,
      subtotal: r2(grava + cero),
      iva,
      total: r2(grava + cero + iva),
      avisos,
    };
    const ins = await this.dataSource.pool.query(
      `INSERT INTO qmi_proforma_borrador (canal_qmpbo, datos_qmpbo, telefono_qmpbo, ide_empr, usuario_ingre)
       VALUES ($1, $2, $3, $4, $5) RETURNING uuid::text AS uuid`,
      [canal, JSON.stringify(datos), telefono, usuario.ideEmpr, usuario.login],
    );
    return { uuid: ins.rows[0].uuid, ...datos, estado: 'BORRADOR' };
  }

  async getBorrador(uuid: string, ideEmpr: number): Promise<BorradorProforma | null> {
    const r = await this.dataSource.pool.query(
      `SELECT uuid::text AS uuid, datos_qmpbo, estado_qmpbo, ide_cccpr, secuencial_qmpbo, fecha_ingre
         FROM qmi_proforma_borrador WHERE uuid = $1::uuid AND ide_empr = $2`,
      [uuid, ideEmpr],
    );
    const b = r.rows[0];
    if (!b) return null;
    return { uuid: b.uuid, ...b.datos_qmpbo, estado: b.estado_qmpbo, ide_cccpr: b.ide_cccpr, secuencial: b.secuencial_qmpbo };
  }

  /**
   * Crea la proforma real a partir del borrador (botón "Crear proforma").
   * @param quien chat del ERP → headers del usuario logueado; Telegram → usuario automático del bot.
   */
  async crear(
    uuid: string,
    quien: { tipo: 'ERP'; headers: HeaderParamsDto } | { tipo: 'TELEGRAM'; ideEmpr: number; ideSucu: number; alias: string },
  ): Promise<{ ide_cccpr: number; secuencial: string; total: number }> {
    const ideEmpr = quien.tipo === 'ERP' ? quien.headers.ideEmpr : quien.ideEmpr;
    const r = await this.dataSource.pool.query(
      `SELECT datos_qmpbo, estado_qmpbo, ide_cccpr, secuencial_qmpbo, fecha_ingre, canal_qmpbo
         FROM qmi_proforma_borrador WHERE uuid = $1::uuid AND ide_empr = $2`,
      [uuid, ideEmpr],
    );
    const b = r.rows[0];
    if (!b) throw new BadRequestException('El borrador no existe');
    if (b.estado_qmpbo === 'CREADA') return { ide_cccpr: b.ide_cccpr, secuencial: b.secuencial_qmpbo, total: Number(b.datos_qmpbo.total) };
    if (b.estado_qmpbo === 'CANCELADA') throw new BadRequestException('El borrador fue cancelado');
    if (Date.now() - new Date(b.fecha_ingre).getTime() > VIGENCIA_BORRADOR_H * 3600_000) {
      throw new BadRequestException('El borrador venció: pide la cotización nuevamente');
    }
    const d = b.datos_qmpbo;
    const lineas: LineaBorrador[] = d.lineas;
    if (lineas.some((l) => l.precio == null)) {
      throw new BadRequestException('Hay productos sin precio: indica el precio en el chat para completar el borrador');
    }

    // Usuario y vendedor de la proforma.
    let headers: HeaderParamsDto;
    let ideUsua: number;
    let ideVgven: number | null = d.cliente.ide_vgven ?? null;
    if (quien.tipo === 'ERP') {
      headers = quien.headers;
      ideUsua = quien.headers.ideUsua;
    } else {
      const auto = await this.proformas.obtenerUsuarioYVendedorAutomatico(ideEmpr);
      ideUsua = auto.ideUsuaAutomatico;
      ideVgven = ideVgven ?? auto.ideVgvenDefecto;
      headers = { ideEmpr, ideSucu: quien.ideSucu, ideUsua, idePerf: 0, login: 'TELEGRAM' } as HeaderParamsDto;
    }
    if (!ideVgven && quien.tipo === 'ERP') {
      ideVgven = (await this.proformas.obtenerUsuarioYVendedorAutomatico(ideEmpr)).ideVgvenDefecto;
    }
    const ideCctpr = quien.tipo === 'ERP' ? await this.tipoProformaErp() : IDE_CCTPR_TELEGRAM;

    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const origen = quien.tipo === 'ERP' ? `chat QuimIA (${quien.headers.login})` : `Telegram QuimIA (${quien.alias})`;
    const res: any = await this.proformas.saveProforma({
      ...headers,
      isUpdate: false,
      data: {
        fecha_cccpr: fecha,
        solicitante_cccpr: String(d.cliente.nombre).slice(0, 200),
        correo_cccpr: String(d.cliente.correo || 'sin-correo@diquimec.com.ec').slice(0, 100),
        ide_cctpr: ideCctpr,
        ide_usua: ideUsua,
        tarifa_iva_cccpr: d.tarifa_iva,
        observacion_cccpr: [d.observacion, `Generada desde ${origen}`].filter(Boolean).join(' · ').slice(0, 200),
        referencia_cccpr: quien.tipo === 'ERP' ? 'QuimIA' : 'Telegram',
        telefono_cccpr: d.cliente.telefono ? String(d.cliente.telefono).slice(0, 50) : undefined,
        ide_getid: d.cliente.ide_getid ?? undefined,
        identificac_cccpr: d.cliente.identificacion ? String(d.cliente.identificacion).slice(0, 13) : undefined,
        ide_vgven: ideVgven ?? undefined,
        direccion_cccpr: d.cliente.direccion ? String(d.cliente.direccion).slice(0, 200) : undefined,
        ide_ccvap: quien.tipo === 'TELEGRAM' ? IDE_CCVAP_TELEGRAM : undefined,
        ide_geper: d.cliente.ide_geper,
        detalles: lineas.map((l) => ({
          ide_inarti: l.ide_inarti,
          cantidad_ccdpr: l.cantidad,
          precio_ccdpr: l.precio,
          total_ccdpr: l.total,
          iva_inarti_ccdpr: l.iva,
          ide_inuni: l.ide_inuni ?? undefined,
          precio_compra_ccdpr: l.costo ?? undefined,
          porcentaje_util_ccdpr: l.porcentaje_utilidad ?? undefined,
          utilidad_ccdpr: l.utilidad ?? undefined,
        })),
      },
    } as any);
    const creada = res?.row ?? res;
    await this.dataSource.pool.query(
      `UPDATE qmi_proforma_borrador SET estado_qmpbo = 'CREADA', ide_cccpr = $2, secuencial_qmpbo = $3,
              usuario_crea = $4, fecha_crea = NOW()
        WHERE uuid = $1::uuid`,
      [uuid, creada.ide_cccpr, String(creada.secuencial_cccpr ?? ''), quien.tipo === 'ERP' ? quien.headers.login : quien.alias],
    );
    this.logger.log(`Proforma ${creada.secuencial_cccpr} creada desde ${origen}`);
    return { ide_cccpr: creada.ide_cccpr, secuencial: String(creada.secuencial_cccpr ?? ''), total: Number(creada.total_cccpr ?? d.total) };
  }

  async cancelar(uuid: string, ideEmpr: number) {
    await this.dataSource.pool.query(
      `UPDATE qmi_proforma_borrador SET estado_qmpbo = 'CANCELADA' WHERE uuid = $1::uuid AND ide_empr = $2 AND estado_qmpbo = 'BORRADOR'`,
      [uuid, ideEmpr],
    );
    return { message: 'ok' };
  }

  /**
   * Tipo de proforma para el chat del ERP: "Agente IA" (lo crea scripts/quimia_comandos.sql); si no
   * existe, uno que contenga IA/QuimIA/Asistente y, en último caso, el primero del catálogo.
   */
  private async tipoProformaErp(): Promise<number> {
    const r = await this.dataSource.pool.query(
      `SELECT ide_cctpr FROM cxc_tipo_proforma
        ORDER BY (UPPER(TRIM(nombre_cctpr)) = 'AGENTE IA') DESC,
                 (UPPER(nombre_cctpr) LIKE '%AGENTE%' OR UPPER(nombre_cctpr) LIKE '%QUIMIA%'
                  OR UPPER(nombre_cctpr) LIKE '%ASISTENTE%') DESC, ide_cctpr
        LIMIT 1`,
    );
    return r.rows[0]?.ide_cctpr ?? 1;
  }
}
