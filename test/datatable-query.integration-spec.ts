/**
 * Prueba de integración de DataSourceService.createQuery (paginación lazy, filtros, orden, totales)
 * contra una base REAL. Se omite si no hay TEST_DB_URL. Tabla requerida:
 *   CREATE TABLE dtq_item (ide_item int primary key, nombre text, categoria text, monto numeric(12,2), creado date);
 *   INSERT INTO dtq_item SELECT g,'item '||g, CASE WHEN g%5=0 THEN 'A' WHEN g%5=1 THEN 'B' ELSE 'C' END,
 *          (g*1.5)::numeric(12,2), date '2026-01-01'+(g%200) FROM generate_series(1,2500) g;
 * Ejecutar: TEST_DB_URL=postgres://dtq:dtq@localhost:5432/dtq_test npx jest --config test/jest-integration.json
 */
jest.mock('src/config/envs', () => ({ envs: { bdUrlPool: process.env.TEST_DB_URL } }));

import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

const describeDb = process.env.TEST_DB_URL ? describe : describe.skip;

describeDb('DataSourceService.createQuery - DataTableQuery lazy (BD real)', () => {
  let ds: DataSourceService;
  const redisStub: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };
  const errorsStub: any = { createErrorLog: jest.fn() };

  beforeAll(() => {
    ds = new DataSourceService(errorsStub, redisStub);
  });
  afterAll(async () => {
    await ds.pool.end();
  });

  const base = 'SELECT * FROM dtq_item';
  const q = (opts: Partial<SelectQuery> & { page?: [number, number] } = {}) => {
    const sq = new SelectQuery(base);
    sq.isSchema = false;
    const [pageSize, pageIndex] = opts.page ?? [50, 0];
    sq.setPagination(pageSize, pageIndex);
    if (opts.orderBy) sq.orderBy = opts.orderBy;
    if (opts.filters) sq.filters = opts.filters;
    if (opts.globalFilter) sq.globalFilter = opts.globalFilter;
    if (opts.lastPage) sq.lastPage = true;
    return sq;
  };

  it('pagina: 50 filas, total 2500, 50 páginas, siguiente sí / anterior no', async () => {
    const r = await ds.createQuery(q({ orderBy: { column: 'ide_item', direction: 'ASC' } as any }));
    expect(r.rows).toHaveLength(50);
    expect(r.rows[0].ide_item).toBe(1);
    expect(r.totalRecords).toBe(2500);
    expect(r.pagination).toMatchObject({ pageSize: 50, pageIndex: 0, totalPages: 50, hasNextPage: true });
    expect(r.pagination.hasPreviousPage).toBeFalsy();
  });

  it('página intermedia: offset correcto y ambos botones habilitados', async () => {
    const r = await ds.createQuery(q({ page: [50, 2], orderBy: { column: 'ide_item', direction: 'ASC' } as any }));
    expect(r.rows[0].ide_item).toBe(101);
    expect(r.pagination).toMatchObject({ pageIndex: 2, totalPages: 50, hasNextPage: true, hasPreviousPage: true });
  });

  it('segunda página: hay página anterior', async () => {
    const r = await ds.createQuery(q({ page: [50, 1], orderBy: { column: 'ide_item', direction: 'ASC' } as any }));
    expect(r.pagination.hasPreviousPage).toBe(true);
  });

  it('última página (índice 49): no hay siguiente, sí anterior', async () => {
    const r = await ds.createQuery(q({ page: [50, 49], orderBy: { column: 'ide_item', direction: 'ASC' } as any }));
    expect(r.rows).toHaveLength(50);
    expect(r.rows[49].ide_item).toBe(2500);
    expect(r.pagination).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
  });

  it('lastPage=true salta a la última página', async () => {
    const r = await ds.createQuery(q({ lastPage: true, orderBy: { column: 'ide_item', direction: 'ASC' } as any }));
    expect(r.rows[r.rows.length - 1].ide_item).toBe(2500);
    expect(r.pagination).toMatchObject({ pageIndex: 49, hasNextPage: false, hasPreviousPage: true });
  });

  it('orden DESC', async () => {
    const r = await ds.createQuery(q({ orderBy: { column: 'ide_item', direction: 'DESC' } as any }));
    expect(r.rows[0].ide_item).toBe(2500);
  });

  it('filtro por columna: total sin filtros y total filtrado', async () => {
    const r = await ds.createQuery(
      q({ filters: [{ column: 'categoria', operator: '=', value: 'A' }], orderBy: { column: 'ide_item', direction: 'ASC' } as any }),
    );
    expect(r.totalRecords).toBe(2500);
    expect(r.totalFilterRecords).toBe(500);
    expect(r.rows).toHaveLength(50);
    expect(r.rows.every((x: any) => x.categoria === 'A')).toBe(true);
    expect(Object.keys(r.rows[0])).not.toContain('__dtq_total_count__');
  });

  it('búsqueda global ILIKE', async () => {
    const r = await ds.createQuery(
      q({ globalFilter: { value: 'item 12', columns: ['nombre'] } as any, orderBy: { column: 'ide_item', direction: 'ASC' } as any }),
    );
    // "item 12", "item 120".."item 129", "item 1200".."item 1299" = 1 + 10 + 100 = 111
    expect(r.totalFilterRecords).toBe(111);
    expect(r.totalRecords).toBe(2500);
  });

  it('filtro que no devuelve filas estando en página avanzada: total filtrado = 0', async () => {
    const r = await ds.createQuery(
      q({ page: [50, 20], filters: [{ column: 'categoria', operator: '=', value: 'Z' }] }),
    );
    expect(r.rows).toHaveLength(0);
    expect(r.totalFilterRecords).toBe(0);
    expect(r.totalRecords).toBe(2500);
  });

  it('filtro con muchos resultados pero página fuera de rango recalcula el total filtrado', async () => {
    const r = await ds.createQuery(
      q({ page: [50, 30], filters: [{ column: 'categoria', operator: '=', value: 'A' }] }),
    );
    expect(r.rows).toHaveLength(0);
    expect(r.totalFilterRecords).toBe(500);
  });

  it('no lazy: trae todo y totalRecords = rowCount', async () => {
    const sq = new SelectQuery(base);
    sq.isSchema = false;
    sq.isLazy = false;
    const r = await ds.createQuery(sq);
    expect(r.rows).toHaveLength(2500);
    expect(r.totalRecords).toBe(2500);
  });

  it('tabla vacía por filtro de negocio: total 0 y sin paginación', async () => {
    const sq = new SelectQuery('SELECT * FROM dtq_item WHERE ide_item < 0');
    sq.isSchema = false;
    sq.setPagination(50, 0);
    const r = await ds.createQuery(sq);
    expect(r.rows).toHaveLength(0);
    expect(r.totalRecords).toBe(0);
  });

  it('parámetros de negocio + filtros no se mezclan (bind correcto)', async () => {
    const sq = new SelectQuery('SELECT * FROM dtq_item WHERE categoria = $1');
    sq.addStringParam(1, 'B');
    sq.isSchema = false;
    sq.setPagination(20, 1);
    sq.filters = [{ column: 'ide_item', operator: '>', value: 1000 }] as any;
    const r = await ds.createQuery(sq);
    expect(r.totalRecords).toBe(500);
    expect(r.totalFilterRecords).toBe(300);
    expect(r.rows).toHaveLength(20);
  });
});
