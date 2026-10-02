// Backend simulado para medir el front: auth + datos reales de dtq_item (PostgreSQL local)
const http = require('http'); const { URL } = require('url'); const qs = require('../../node_modules/qs');
const { Pool } = require('../../node_modules/pg');
const pool = new Pool({ connectionString: 'postgres://dtq:dtq@localhost:5432/dtq_test' });
const col = (name, i, o = {}) => ({ name, tableID: 1, dataTypeID: 25, dataType: 'String', order: i, label: name, required: false, visible: i > 0, length: 50, disabled: false, filter: false, comment: '', component: 'Text', upperCase: false, orderable: true, size: 140, align: 'left', defaultValue: '', header: name, ...o });
const columns = [col('ide_item', 0, { dataType: 'Integer', align: 'right' }), col('nombre', 1), col('categoria', 2), col('monto', 3, { dataType: 'Numeric', align: 'right' }), col('creado', 4, { dataType: 'Date' })];
const user = { ide_usua: 1, login: 'test', isSuperUser: true, requireChange: false, ip: '127.0.0.1', empresas: [], sucursales: [], perfiles: [], email: 't@t.com', displayName: 'Test', role: 'admin' };
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); res.end(JSON.stringify(body)); };
let hits = {};
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const u = new URL(req.url, 'http://x'); const p = u.pathname; hits[p] = (hits[p] || 0) + 1;
  if (p === '/__hits') { const h = hits; hits = {}; return send(res, 200, h); }
  if (p === '/api/auth/me') return send(res, 200, { user });
  if (p.endsWith('/getFacturas')) {
    const q = qs.parse(u.search.slice(1)); const size = Number(q.pagination?.pageSize || 50); const idx = Number(q.pagination?.pageIndex || 0);
    const dir = q.orderBy?.direction === 'DESC' ? 'DESC' : 'ASC'; const ocol = ['ide_item', 'nombre', 'categoria', 'monto', 'creado'].includes(q.orderBy?.column) ? q.orderBy.column : 'ide_item';
    const total = (await pool.query('select count(*)::int c from dtq_item')).rows[0].c;
    const rows = (await pool.query(`select * from dtq_item order by ${ocol} ${dir} offset $1 limit $2`, [idx * size, size])).rows;
    const pages = Math.ceil(total / size);
    return send(res, 200, { totalRecords: total, pagination: { pageSize: size, pageIndex: idx, offset: idx * size, totalPages: pages, hasNextPage: idx + 1 < pages, hasPreviousPage: idx > 0 }, rowCount: rows.length, rows, message: 'ok', columns: q.schema === 'false' ? undefined : columns, key: 'ide_item', queryName: 'dtq.getFacturas' });
  }
  if (p.endsWith('/getTotalFacturasPorEstado')) return send(res, 200, []);
  return send(res, 200, []);
}).listen(3999, '127.0.0.1', () => console.log('mock on 3999'));
