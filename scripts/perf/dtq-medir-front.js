/* Mide el front de DataTableQuery: ms desde el clic en "siguiente" hasta ver las filas nuevas y commits de React.
 * Uso: ver docs/datatablequery-plan-optimizacion.md sección 9. Requiere: playwright, el front en marcha (PORT) y
 * scripts/perf/dtq-mock-server.js (puerto 3999) con una BD de pruebas (tabla dtq_item de test/datatable-query.integration-spec.ts). */
const { chromium } = require('playwright');
(async () => {
  const version = process.env.FRONT_VERSION || require(process.env.FRONT_PKG || '../../../react-front-erp/package.json').version;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const token = `${b64({ alg: 'none' })}.${b64({ exp, sub: 1 })}.x`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(async () => chromium.launch({ args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(({ token, version }) => {
    localStorage.setItem('jwt_access_token', token);
    localStorage.setItem('jwt_refresh_token', 'r');
    localStorage.setItem('user', JSON.stringify({ ide_usua: 1, login: 'test', ip: '127.0.0.1', isSuperUser: true, empresas: [{ ide_empr: 1, nom_empr: 'E' }], sucursales: [{ ide_sucu: 1, nom_sucu: 'S' }], perfiles: [{ ide_perf: 1, nom_perf: 'P' }] }));
    localStorage.setItem('app-settings', JSON.stringify({ version, menu: [], navLayout: 'mini', empresa: { ide_empr: 1, nom_empr: 'E' }, sucursal: { ide_sucu: 1, nom_sucu: 'S' }, perfil: { ide_perf: 1, nom_perf: 'P' } }));
    // Contador de commits de React (sin tocar el código de la app)
    window.__commits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberRoot() { window.__commits++; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {} };
  }, { token, version });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 150)));
  await page.goto('http://localhost:'+(process.env.PORT||18080)+'/dashboard/ventas/facturacion/list', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const ok = page.getByRole('button', { name: 'Aceptar' });
  if (await ok.count()) { await ok.first().click().catch(() => {}); await page.waitForTimeout(3000); }
  const commits = () => page.evaluate(() => window.__commits);
  const body = await page.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n/g, ' | '));
  console.log('BODY:', body);
  const rowsCount = async () => page.evaluate(() => document.querySelectorAll('tbody tr').length);
  console.log('filas visibles:', await rowsCount(), 'commits tras carga:', await commits());
  const firstRow = () => page.evaluate(() => { const tr = document.querySelector('tbody tr'); return tr ? tr.innerText.replace(/\s+/g, ' ').slice(0, 60) : ''; });
  const latency = async (label, action, expected) => {
    const c0 = await commits(); const t0 = Date.now(); await action();
    while (!(await firstRow()).includes(expected) && Date.now() - t0 < 6000) await page.waitForTimeout(10);
    const ms = Date.now() - t0; await page.waitForTimeout(800);
    console.log(`LAT ${label}: ${ms} ms hasta ver filas nuevas, ${(await commits()) - c0} commits`); return ms;
  };
  await page.evaluate(() => performance.clearResourceTimings());
  const r = [];
  for (let i = 0; i < 5; i++) r.push(await latency(`pagina siguiente #${i + 1}`, () => page.getByRole('button', { name: /siguiente|next/i }).first().click(), `item ${(i + 1) * 50 + 1} `));
  console.log('RED', await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('getFacturas')).map((e) => `inicio=${Math.round(e.startTime)} dur=${Math.round(e.duration)}ms`).join(' | ')));
  console.log('RESUMEN paginar media', Math.round(r.reduce((a, b) => a + b, 0) / r.length), 'ms; ordenar', Math.round((s1 + s2) / 2), 'ms');
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
