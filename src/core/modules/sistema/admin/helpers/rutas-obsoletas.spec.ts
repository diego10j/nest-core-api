import { calcularRutasObsoletas, extraerRutasYGrupos, OpcionBd } from './rutas-obsoletas';

const menu = [
  {
    subheader: 'Management',
    items: [
      { title: 'Inicio', path: '/dashboard' },
      { title: 'WhatsApp', children: [{ title: 'Chat', path: '/dashboard/whatsapp' }] },
    ],
  },
];

const op = (ide_opci: number, nom_opci: string, tipo_opci: string | null, sis_ide_opci: number | null = null): OpcionBd => ({
  ide_opci, nom_opci, tipo_opci, sis_ide_opci,
});

describe('extraerRutasYGrupos', () => {
  it('separa rutas (con path) de grupos (sin path), incluyendo hijos de children e items', () => {
    const { paths, grupos } = extraerRutasYGrupos(menu);
    expect([...paths].sort()).toEqual(['/dashboard', '/dashboard/whatsapp']);
    expect([...grupos].sort()).toEqual(['Management', 'WhatsApp']);
  });
});

describe('calcularRutasObsoletas', () => {
  const bd = [
    op(1, 'Management', null),
    op(2, 'Inicio', '/dashboard', 1),
    op(3, 'WhatsApp', null, 1),
    op(4, 'Chat', '/dashboard/whatsapp', 3),
    op(5, 'Campañas', '/dashboard/sistema/whatsapp/campania', 3),
  ];

  it('detecta solo lo que ya no está en el archivo', () => {
    const r = calcularRutasObsoletas(bd, menu);
    expect(r.candidatas.map((o) => o.ide_opci)).toEqual([5]);
    expect(r.conservadas).toEqual([]);
    expect(r.totalRutasArchivo).toBe(2);
  });

  it('tolera espacios en las rutas', () => {
    const r = calcularRutasObsoletas([op(2, 'Inicio', ' /dashboard ')], menu);
    expect(r.candidatas).toEqual([]);
  });

  it('un grupo obsoleto se elimina junto con sus hijos obsoletos', () => {
    const r = calcularRutasObsoletas(
      [op(10, 'Antiguo', null), op(11, 'Pantalla vieja', '/dashboard/vieja', 10), op(2, 'Inicio', '/dashboard')],
      menu,
    );
    expect(r.candidatas.map((o) => o.ide_opci).sort()).toEqual([10, 11]);
  });

  it('conserva un obsoleto que aún tiene un hijo en uso', () => {
    const r = calcularRutasObsoletas([op(20, 'Grupo renombrado', null), op(21, 'Inicio', '/dashboard', 20)], menu);
    expect(r.candidatas).toEqual([]);
    expect(r.conservadas).toHaveLength(1);
    expect(r.conservadas[0].ide_opci).toBe(20);
    expect(r.conservadas[0].motivo).toContain('Inicio');
  });
});
