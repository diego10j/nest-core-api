import { BadRequestException } from '@nestjs/common';

jest.mock('src/config/envs', () => ({ envs: { idSistema: 2 } }), { virtual: true });
jest.mock('src/core/connection/datasource.service', () => ({ DataSourceService: class {} }), { virtual: true });
jest.mock('src/core/core.service', () => ({ CoreService: class {} }), { virtual: true });
jest.mock('src/util/helpers/common-util', () => ({ isDefined: (v: any) => v !== undefined && v !== null }), { virtual: true });
jest.mock('src/common/dto/common-params.dto', () => ({ HeaderParamsDto: class {} }), { virtual: true });
jest.mock('src/common/dto/query-options.dto', () => ({ QueryOptionsDto: class {} }), { virtual: true });
jest.mock('src/core/connection/interfaces/resultQuery', () => ({}), { virtual: true });
jest.mock('src/core/connection/helpers', () => {
  class Q { params: any[] = []; where = ''; addArrayNumberParam(_i: number, v: any) { this.params.push(v); } addIntParam(_i: number, v: any) { this.params.push(v); } }
  return { DeleteQuery: class extends Q { constructor(public table: string) { super(); } }, SelectQuery: class extends Q { constructor(public sql: string) { super(); } }, InsertQuery: class {}, Query: class {} };
}, { virtual: true });

import { AdminService } from './admin.service';

const opciones = [
  { ide_opci: 1, sis_ide_opci: null, nom_opci: 'Menu', tipo_opci: null, perfiles: '0' },
  { ide_opci: 2, sis_ide_opci: 1, nom_opci: 'Inicio', tipo_opci: '/dashboard', perfiles: '3' },
  { ide_opci: 3, sis_ide_opci: 1, nom_opci: 'Campañas', tipo_opci: '/dashboard/campania', perfiles: '2' },
];
const json = [{ subheader: 'Menu', items: [{ title: 'Inicio', path: '/dashboard' }] }];

const build = () => {
  const dataSource: any = {
    createSelectQuery: jest.fn().mockResolvedValue(opciones),
    createListQuery: jest.fn().mockResolvedValue(['ok', 'ok']),
  };
  return { service: new AdminService(dataSource, {} as any), dataSource };
};

describe('AdminService: rutas obsoletas', () => {
  it('detecta como obsoleta solo la ruta que ya no está en el archivo', async () => {
    const { service } = build();
    const r = await service.getRutasObsoletas({ json } as any);
    expect(r.candidatas.map((o) => o.ide_opci)).toEqual([3]);
    expect(r.candidatas[0].perfiles).toBe(2);
  });

  it('rechaza un archivo sin rutas (todo parecería obsoleto)', async () => {
    const { service } = build();
    await expect(service.getRutasObsoletas({ json: [{ subheader: 'Vacío' }] } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.eliminarRutasObsoletas({ json: [], ide_opci: [3] } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('elimina primero los permisos y luego la opción, y solo lo que hoy es obsoleto', async () => {
    const { service, dataSource } = build();
    // 2 está en uso y 99 no existe: solo se elimina el 3
    const r = await service.eliminarRutasObsoletas({ json, ide_opci: [3, 2, 99], login: 'admin' } as any);
    expect(r.eliminadas).toBe(1);
    const [queries] = dataSource.createListQuery.mock.calls[0];
    expect(queries.map((q: any) => q.table)).toEqual(['sis_perfil_opcion', 'sis_opcion']);
    expect(queries[0].params[0]).toEqual([3]);
    expect(queries[1].params).toEqual([[3], 2]);
  });

  it('no elimina nada si lo pedido ya no es obsoleto', async () => {
    const { service, dataSource } = build();
    await expect(service.eliminarRutasObsoletas({ json, ide_opci: [2] } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.createListQuery).not.toHaveBeenCalled();
  });
});
