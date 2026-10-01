import { aplanarMenu, compararMenuConBd, planificarImportacion } from './importar-opciones';
import { MenuNodo, OpcionBd } from './rutas-obsoletas';

const menu: MenuNodo[] = [
  {
    subheader: 'Management',
    items: [
      {
        title: 'Admin',
        path: '/root',
        icon: 'i:root',
        children: [
          { title: 'Empresa', path: '/empresa' },
          { title: 'Grupo nuevo', children: [{ title: 'Hoja', path: '/hoja' }] },
        ],
      },
    ],
  },
];

const bd: OpcionBd[] = [
  { ide_opci: 1, sis_ide_opci: null, nom_opci: 'Management', tipo_opci: null, activo_opci: true, icono_opci: null, orden_opci: 1 },
  { ide_opci: 2, sis_ide_opci: 1, nom_opci: 'Admin', tipo_opci: '/root', activo_opci: true, icono_opci: 'i:root', orden_opci: 1 },
  { ide_opci: 3, sis_ide_opci: 2, nom_opci: 'Empresa vieja', tipo_opci: '/empresa', activo_opci: true, icono_opci: null, orden_opci: 1 },
];

describe('importar-opciones', () => {
  it('aplana en pre-orden con padre, orden y ubicación', () => {
    const n = aplanarMenu(menu);
    expect(n.map((x) => x.clave)).toEqual(['grupo:Management', '/root', '/empresa', 'grupo:Grupo nuevo', '/hoja']);
    expect(n[3]).toMatchObject({ claveHijoDe: '/root', orden: 2, nivel: 2, ubicacion: 'Management › Admin' });
  });

  it('descarta paths repetidos', () => {
    const n = aplanarMenu([{ subheader: 'A', items: [{ title: 'x', path: '/x' }, { title: 'y', path: '/x' }] }]);
    expect(n.filter((x) => x.path === '/x')).toHaveLength(1);
  });

  it('marca nueva / cambios / igual', () => {
    const c = compararMenuConBd(aplanarMenu(menu), bd);
    const estado = Object.fromEntries(c.map((x) => [x.clave, x.estado]));
    expect(estado).toEqual({
      'grupo:Management': 'igual',
      '/root': 'igual',
      '/empresa': 'cambios',
      'grupo:Grupo nuevo': 'nueva',
      '/hoja': 'nueva',
    });
    expect(c.find((x) => x.clave === '/empresa')?.cambios[0]).toContain('Empresa vieja');
  });

  it('una opción inactiva se marca para reactivar', () => {
    const c = compararMenuConBd(aplanarMenu(menu), bd.map((o) => (o.ide_opci === 2 ? { ...o, activo_opci: false } : o)));
    expect(c.find((x) => x.clave === '/root')?.estado).toBe('cambios');
  });

  it('al elegir una hoja nueva agrega su grupo nuevo; ignora lo igual y lo desconocido', () => {
    const c = compararMenuConBd(aplanarMenu(menu), bd);
    const plan = planificarImportacion(c, ['/hoja', '/root', '/no-existe']);
    expect(plan.crear.map((x) => x.clave)).toEqual(['grupo:Grupo nuevo', '/hoja']);
    expect(plan.actualizar).toEqual([]);
    expect(plan.gruposAgregados).toEqual(['Grupo nuevo']);
  });

  it('solo actualiza lo elegido', () => {
    const c = compararMenuConBd(aplanarMenu(menu), bd);
    const plan = planificarImportacion(c, ['/empresa']);
    expect(plan.actualizar.map((x) => x.clave)).toEqual(['/empresa']);
    expect(plan.crear).toEqual([]);
  });
});
