import { MenuNodo, OpcionBd } from './rutas-obsoletas';

export type EstadoImportacion = 'nueva' | 'cambios' | 'igual';

/** Nodo del archivo de menú, aplanado en pre-orden (el padre siempre va antes que sus hijos). */
export interface NodoMenu {
  /** Identificador estable: la ruta si tiene, si no `grupo:<titulo>` */
  clave: string;
  titulo: string;
  path: string | null;
  icono: string | null;
  /** Posición entre sus hermanos, base 1 (igual que orden_opci) */
  orden: number;
  nivel: number;
  claveHijoDe: string | null;
  /** Texto "Administración › WhatsApp" para mostrar dónde cuelga */
  ubicacion: string;
}

export interface NodoComparado extends NodoMenu {
  estado: EstadoImportacion;
  /** Qué cambia respecto a la BD (solo si estado = 'cambios') */
  cambios: string[];
  ide_opci: number | null;
}

const MAX_NIVEL = 5;

/**
 * Aplana el archivo de menú con las mismas reglas de f_generar_opciones_proerp: usa 'children' si existe,
 * si no 'items'; el path es único (se conserva la primera aparición) y los grupos se identifican por título.
 */
export function aplanarMenu(json: MenuNodo[]): NodoMenu[] {
  const resultado: NodoMenu[] = [];
  const vistas = new Set<string>();

  const visitar = (nodo: MenuNodo, nivel: number, orden: number, padre: NodoMenu | null) => {
    const titulo = (nodo.subheader?.trim() || nodo.title?.trim() || '') as string;
    const path = nodo.path?.trim() || null;
    const clave = path ?? `grupo:${titulo}`;
    if (!titulo || vistas.has(clave)) return;
    vistas.add(clave);

    const actual: NodoMenu = {
      clave,
      titulo,
      path,
      icono: nodo.icon?.trim() || null,
      orden,
      nivel,
      claveHijoDe: padre?.clave ?? null,
      ubicacion: padre ? (padre.ubicacion ? `${padre.ubicacion} › ${padre.titulo}` : padre.titulo) : '',
    };
    resultado.push(actual);

    if (nivel < MAX_NIVEL) {
      const hijos = nodo.children ?? nodo.items ?? [];
      hijos.forEach((h, i) => visitar(h, nivel + 1, i + 1, actual));
    }
  };
  (json ?? []).forEach((n, i) => visitar(n, 0, i + 1, null));
  return resultado;
}

function buscarEnBd(nodo: NodoMenu, opciones: OpcionBd[]): OpcionBd | undefined {
  if (nodo.path) return opciones.find((o) => o.tipo_opci?.trim() === nodo.path);
  return opciones.find((o) => !o.tipo_opci?.trim() && o.nom_opci?.trim() === nodo.titulo);
}

/** Compara cada nodo del archivo con sis_opcion: nueva, con cambios o igual. */
export function compararMenuConBd(nodos: NodoMenu[], opciones: OpcionBd[]): NodoComparado[] {
  const idPorClave = new Map<string, number | null>();
  const coincidencias = nodos.map((n) => {
    const o = buscarEnBd(n, opciones);
    idPorClave.set(n.clave, o?.ide_opci ?? null);
    return o;
  });

  return nodos.map((n, i) => {
    const o = coincidencias[i];
    if (!o) return { ...n, estado: 'nueva', cambios: [], ide_opci: null };

    const cambios: string[] = [];
    if (o.activo_opci === false) cambios.push('Está inactiva: se reactiva');
    if ((o.nom_opci ?? '').trim() !== n.titulo) cambios.push(`Nombre: "${o.nom_opci}" → "${n.titulo}"`);
    const padreEsperado = n.claveHijoDe ? (idPorClave.get(n.claveHijoDe) ?? null) : null;
    if ((o.sis_ide_opci ?? null) !== padreEsperado) cambios.push('Cambia de grupo');
    if ((o.icono_opci?.trim() || null) !== n.icono) cambios.push('Cambia el icono');
    if ((o.orden_opci ?? null) !== n.orden) cambios.push(`Orden: ${o.orden_opci ?? '-'} → ${n.orden}`);
    return { ...n, estado: cambios.length ? 'cambios' : 'igual', cambios, ide_opci: o.ide_opci };
  });
}

/** Operaciones a aplicar en la BD, en orden (padres antes que hijos). */
export interface PlanImportacion {
  crear: NodoComparado[];
  actualizar: NodoComparado[];
  /** Grupos nuevos que no se marcaron pero hacen falta como padres de lo marcado */
  gruposAgregados: string[];
}

/**
 * Arma el plan para las claves elegidas por el usuario. Las claves que no existen en el archivo o que ya
 * están iguales se ignoran. Si lo elegido cuelga de un grupo que aún no existe en la BD, ese grupo se crea.
 */
export function planificarImportacion(comparados: NodoComparado[], seleccion: string[]): PlanImportacion {
  const porClave = new Map(comparados.map((n) => [n.clave, n]));
  const elegidas = new Set(seleccion.filter((c) => porClave.get(c)?.estado !== undefined && porClave.get(c)?.estado !== 'igual'));
  const agregados: string[] = [];

  for (const clave of [...elegidas]) {
    let padre = porClave.get(clave)?.claveHijoDe;
    while (padre) {
      const nodoPadre = porClave.get(padre);
      if (nodoPadre?.estado === 'nueva' && !elegidas.has(padre)) {
        elegidas.add(padre);
        agregados.push(nodoPadre.titulo);
      }
      padre = nodoPadre?.claveHijoDe;
    }
  }

  const ordenadas = comparados.filter((n) => elegidas.has(n.clave));
  return {
    crear: ordenadas.filter((n) => n.estado === 'nueva'),
    actualizar: ordenadas.filter((n) => n.estado === 'cambios'),
    gruposAgregados: agregados,
  };
}
