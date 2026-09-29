import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { claveEmpresa } from './helpers/normalizar.helper';

/** Palabras que, solas, no identifican a una empresa (evitan falsos positivos con claves de una palabra). */
const PALABRAS_GENERICAS = new Set([
  'QUIMICA',
  'QUIMICOS',
  'QUIMICO',
  'INDUSTRIAL',
  'INDUSTRIALES',
  'INDUSTRIAS',
  'INDUSTRIA',
  'COMERCIAL',
  'COMERCIALIZADORA',
  'DISTRIBUIDORA',
  'DISTRIBUCIONES',
  'IMPORTADORA',
  'IMPORTACIONES',
  'ECUADOR',
  'NACIONAL',
  'INTERNACIONAL',
  'GLOBAL',
  'PRODUCTOS',
  'SERVICIOS',
  'GRUPO',
  'CORPORACION',
  'TECNICA',
  'LABORATORIO',
  'LABORATORIOS',
  'ALIMENTOS',
  'NATURAL',
  'NATURALES',
  'ANDINA',
  'PACIFICO',
  'QUITO',
  'GUAYAQUIL',
  'CUENCA',
  'SOLUCIONES',
  'INSUMOS',
  'MATERIAS',
  'PRIMAS',
  'COMPANY',
  'CHEMICAL',
  'CHEMICALS',
]);

/** Razón social en español que claveEmpresa no quita ("COMPAÑIA LIMITADA", "SOCIEDAD ANONIMA"…). */
const SUFIJOS_ES = /\b(SOCIEDAD ANONIMA|SOCIEDAD POR ACCIONES SIMPLIFICADA|COMPANIA LIMITADA|COMPANIA ANONIMA)\b/g;

interface Patron {
  tokens: string[];
  ide_geper: number;
  nombre: string;
  ruc: string;
}

interface Coincidencia {
  ide_geper: number;
  nombre: string;
  ruc: string;
  pagina: number | null;
  fragmento: string;
}

const tokenizar = (texto: string) => claveEmpresa(texto).split(' ').filter(Boolean);

/**
 * Documentos de la base técnica que mencionan a un PROVEEDOR LOCAL (gen_persona con RUC, ej.
 * RESIQUIM): un documento técnico no debe mostrar al importador/distribuidor por el que llegó el
 * producto. Se busca el nombre (y el RUC) de cada proveedor en el texto extraído del documento.
 * Los documentos que mencionan a la propia empresa (sis_empresa) se omiten: son importaciones propias.
 */
@Injectable()
export class BdtImportadorService {
  constructor(private readonly dataSource: DataSourceService) {}

  async getDocumentosConProveedor(dto: HeaderParamsDto) {
    const [empresaR, proveedoresR, docsR] = await Promise.all([
      this.dataSource.pool.query(
        `SELECT nom_empr, nom_corto_empr, identificacion_empr FROM sis_empresa WHERE ide_empr = $1`,
        [dto.ideEmpr],
      ),
      // Proveedores locales: identificación con forma de RUC ecuatoriano (13 dígitos).
      this.dataSource.pool.query(
        `SELECT ide_geper, nom_geper, identificac_geper
           FROM gen_persona
          WHERE ide_empr = $1 AND es_proveedo_geper = TRUE AND nivel_geper = 'HIJO'
            AND identificac_geper ~ '^[0-9]{13}$'`,
        [dto.ideEmpr],
      ),
      this.dataSource.pool.query(
        `SELECT d.ide_bddoc, d.ide_inarti, a.uuid::text AS uuid_inarti, a.nombre_inarti, d.nombre_original_bddoc, d.tipo_bddoc, d.estado_bddoc,
                d.vigente_bddoc, d.fabricante_detectado_bddoc, d.proveedor_detectado_bddoc, d.texto_original_bddoc
           FROM bdt_documento d
           JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
          WHERE d.ide_empr = $1 AND d.texto_original_bddoc IS NOT NULL
          ORDER BY a.nombre_inarti, d.ide_bddoc`,
        [dto.ideEmpr],
      ),
    ]);

    const empresa = empresaR.rows[0] ?? {};
    const rucEmpresa: string = empresa.identificacion_empr ?? '';
    const patronesEmpresa = [empresa.nom_empr, empresa.nom_corto_empr]
      .map((n) => this.clave(n))
      .filter((t) => this.esClaveValida(t))
      .map((tokens) => ({ tokens, ide_geper: 0, nombre: '', ruc: '' }));
    if (rucEmpresa) patronesEmpresa.push({ tokens: [rucEmpresa], ide_geper: 0, nombre: '', ruc: '' });

    const patrones: Patron[] = [];
    for (const p of proveedoresR.rows) {
      if (p.identificac_geper === rucEmpresa) continue;
      const base = { ide_geper: p.ide_geper, nombre: p.nom_geper, ruc: p.identificac_geper };
      const tokens = this.clave(p.nom_geper);
      if (this.esClaveValida(tokens)) patrones.push({ ...base, tokens });
      patrones.push({ ...base, tokens: [p.identificac_geper] });
    }
    const indiceEmpresa = this.indexar(patronesEmpresa);
    const indiceProveedores = this.indexar(patrones);

    const rows: any[] = [];
    for (const d of docsR.rows) {
      const paginas = this.paginas(
        [d.texto_original_bddoc, d.fabricante_detectado_bddoc, d.proveedor_detectado_bddoc].filter(Boolean).join('\n'),
      );
      // Documento de una importación propia (menciona a la empresa): no se considera.
      if (paginas.some((p) => this.buscar(p.tokens, indiceEmpresa, p.numero, true).length)) continue;

      const porProveedor = new Map<number, Coincidencia>();
      for (const p of paginas) {
        for (const c of this.buscar(p.tokens, indiceProveedores, p.numero, false)) {
          if (!porProveedor.has(c.ide_geper)) porProveedor.set(c.ide_geper, c);
        }
      }
      if (!porProveedor.size) continue;

      const encontrados = [...porProveedor.values()];
      rows.push({
        ide_bddoc: d.ide_bddoc,
        ide_inarti: d.ide_inarti,
        uuid_inarti: d.uuid_inarti,
        nombre_inarti: d.nombre_inarti,
        nombre_original_bddoc: d.nombre_original_bddoc,
        tipo_bddoc: d.tipo_bddoc,
        estado_bddoc: d.estado_bddoc,
        vigente_bddoc: d.vigente_bddoc,
        proveedores: encontrados.map((c) => c.nombre).join(', '),
        coincidencias: encontrados,
      });
    }
    return { rowCount: rows.length, rows };
  }

  /** Tokens identificativos del nombre: sin razón social (S.A., CIA. LTDA., INC…). */
  private clave(nombre: string | null | undefined): string[] {
    return claveEmpresa(nombre).replace(SUFIJOS_ES, ' ').split(' ').filter(Boolean);
  }

  /** Una sola palabra solo cuenta si es distintiva (≥ 5 letras y no genérica): "RESIQUIM" sí, "QUIMICA" no. */
  private esClaveValida(tokens: string[]): boolean {
    if (!tokens.length) return false;
    if (tokens.length > 1) return tokens.join('').length >= 6;
    return tokens[0].length >= 5 && !PALABRAS_GENERICAS.has(tokens[0]) && !/^\d+$/.test(tokens[0]);
  }

  private indexar(patrones: Patron[]): Map<string, Patron[]> {
    const indice = new Map<string, Patron[]>();
    for (const p of patrones) {
      const lista = indice.get(p.tokens[0]) ?? [];
      lista.push(p);
      indice.set(p.tokens[0], lista);
    }
    return indice;
  }

  /** texto_original_bddoc viene como "[Página N]\n…": se separa para indicar dónde aparece el nombre. */
  private paginas(texto: string): { numero: number | null; tokens: string[] }[] {
    const partes = texto.split(/\[P[áa]gina (\d+)\]/i);
    const out: { numero: number | null; tokens: string[] }[] = [];
    if (partes[0]?.trim()) out.push({ numero: null, tokens: tokenizar(partes[0]) });
    for (let i = 1; i < partes.length; i += 2)
      out.push({ numero: Number(partes[i]), tokens: tokenizar(partes[i + 1] ?? '') });
    return out;
  }

  private buscar(
    tokens: string[],
    indice: Map<string, Patron[]>,
    pagina: number | null,
    primera: boolean,
  ): Coincidencia[] {
    const out: Coincidencia[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const candidatos = indice.get(tokens[i]);
      if (!candidatos) continue;
      for (const p of candidatos) {
        if (!p.tokens.every((t, k) => tokens[i + k] === t)) continue;
        out.push({
          ide_geper: p.ide_geper,
          nombre: p.nombre,
          ruc: p.ruc,
          pagina,
          fragmento: tokens.slice(Math.max(0, i - 8), i + p.tokens.length + 8).join(' '),
        });
        if (primera) return out;
      }
    }
    return out;
  }
}
