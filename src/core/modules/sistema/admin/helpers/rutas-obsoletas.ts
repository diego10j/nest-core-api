export interface OpcionBd {
  ide_opci: number;
  sis_ide_opci: number | null;
  nom_opci: string;
  tipo_opci: string | null;
  activo_opci?: boolean | null;
  icono_opci?: string | null;
  orden_opci?: number | null;
  perfiles?: number;
}

export interface MenuNodo {
  title?: string;
  subheader?: string;
  path?: string;
  icon?: string;
  children?: MenuNodo[];
  items?: MenuNodo[];
}

export interface RutasObsoletas {
  /** Opciones de la BD que ya no están en el archivo de menú y se pueden eliminar */
  candidatas: OpcionBd[];
  /** Opciones que ya no están en el archivo pero se conservan porque aún tienen hijos en uso */
  conservadas: Array<OpcionBd & { motivo: string }>;
  /** Cuántas rutas (con path) y grupos (sin path) trae el archivo */
  totalRutasArchivo: number;
}

/** Rutas (con path) y títulos de grupos (sin path) del archivo de menú, igual que los reconoce f_generar_opciones_proerp. */
export function extraerRutasYGrupos(json: MenuNodo[]): { paths: Set<string>; grupos: Set<string> } {
  const paths = new Set<string>();
  const grupos = new Set<string>();

  const visitar = (nodo: MenuNodo) => {
    const titulo = (nodo.subheader?.trim() || nodo.title?.trim() || '') as string;
    const path = nodo.path?.trim();
    if (path) paths.add(path);
    else if (titulo) grupos.add(titulo);
    // Como el generador: usa 'children' si existe, si no 'items'
    const hijos = nodo.children ?? nodo.items ?? [];
    hijos.forEach(visitar);
  };
  (json ?? []).forEach(visitar);
  return { paths, grupos };
}

/**
 * Compara las opciones guardadas en la BD con el archivo de menú importado.
 * Una opción está en uso si su ruta (tipo_opci) está en el archivo o, si es un grupo sin ruta, si su
 * nombre aparece como grupo. Lo demás es obsoleto. Una opción obsoleta con algún hijo en uso se
 * conserva (no se puede borrar un padre cuyo hijo sigue vigente).
 */
export function calcularRutasObsoletas(opciones: OpcionBd[], json: MenuNodo[]): RutasObsoletas {
  const { paths, grupos } = extraerRutasYGrupos(json);

  const enUso = (o: OpcionBd) => {
    const ruta = o.tipo_opci?.trim();
    return ruta ? paths.has(ruta) : grupos.has((o.nom_opci ?? '').trim());
  };

  const candidatas = new Map<number, OpcionBd>();
  opciones.filter((o) => !enUso(o)).forEach((o) => candidatas.set(o.ide_opci, o));

  const hijosDe = new Map<number, OpcionBd[]>();
  opciones.forEach((o) => {
    if (o.sis_ide_opci != null) hijosDe.set(o.sis_ide_opci, [...(hijosDe.get(o.sis_ide_opci) ?? []), o]);
  });

  // Un obsoleto con algún hijo que NO es obsoleto se conserva; se repite hasta que no haya cambios
  const conservadas: Array<OpcionBd & { motivo: string }> = [];
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const [id, o] of [...candidatas]) {
      const hijoVigente = (hijosDe.get(id) ?? []).find((h) => !candidatas.has(h.ide_opci));
      if (hijoVigente) {
        candidatas.delete(id);
        conservadas.push({ ...o, motivo: `Tiene una opción en uso dentro: ${hijoVigente.nom_opci}` });
        cambio = true;
      }
    }
  }

  return {
    candidatas: [...candidatas.values()].sort((a, b) => a.nom_opci.localeCompare(b.nom_opci)),
    conservadas,
    totalRutasArchivo: paths.size,
  };
}
