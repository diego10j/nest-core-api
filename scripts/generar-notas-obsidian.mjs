#!/usr/bin/env node
/**
 * Genera una nota Markdown por cada tabla del schema de Postgres, con columnas + FKs
 * entrantes/salientes como [[wikilinks]], para el vault de Obsidian (erp-knowledge).
 *
 * Consultas en bloque (no una por tabla) - con ~500 tablas corre en segundos, no en horas.
 *
 * Uso (valores por defecto pensados para correr en el servidor Debian, donde nest-core-api
 * y erp-knowledge viven en el mismo host - ver erp-knowledge/_Schema-Completo/README.md):
 *
 *   node scripts/generar-notas-obsidian.mjs
 *
 * Variables de entorno (todas opcionales, con default razonable para el servidor):
 *   PGHOST      default: /var/run/postgresql (socket local, peer auth)
 *   PGDATABASE  default: sigafi_dbo
 *   PGUSER      default: el usuario del proceso (postgres si se corre con sudo -u postgres)
 *   OUT_DIR     default: ../erp-knowledge/_Schema-Completo (asume ambos repos como
 *               hermanos dentro de /proerp - ajustar si la estructura real es otra)
 *   AUTO_COMMIT default: "true" - si el OUT_DIR es parte de un repo git, hace
 *               add+commit+push automático al terminar (poner "false" para desactivar)
 */

import { Client } from 'pg';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(process.env.OUT_DIR || join(__dirname, '..', '..', 'erp-knowledge', '_Schema-Completo'));
const GLOSARIO_DIR = process.env.GLOSARIO_DIR || join(dirname(OUT_DIR), '_Glosario-Tablas');
const SCHEMA = process.env.PGSCHEMA || 'public';
const AUTO_COMMIT = (process.env.AUTO_COMMIT ?? 'true') === 'true';
const EXCLUDE = (process.env.EXCLUDE_TABLES || 'typeorm_metadata,migrations')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

async function main() {
  const client = new Client({
    host: process.env.PGHOST || '/var/run/postgresql',
    database: process.env.PGDATABASE || 'sigafi_dbo',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  console.log(`Conectado. Introspectando schema "${SCHEMA}" (consultas en bloque)...`);

  const { rows: tables } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
    [SCHEMA],
  );
  const tableNames = tables.map((t) => t.tablename).filter((t) => !EXCLUDE.includes(t));
  console.log(`${tableNames.length} tablas a procesar.`);

  const { rows: allColumns } = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, ordinal_position`,
    [SCHEMA],
  );
  const columnsByTable = groupBy(allColumns, 'table_name');

  const { rows: allPks } = await client.query(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
    [SCHEMA],
  );
  const pkColsByTable = new Map();
  for (const row of allPks) {
    if (!pkColsByTable.has(row.table_name)) pkColsByTable.set(row.table_name, new Set());
    pkColsByTable.get(row.table_name).add(row.column_name);
  }

  const { rows: allFks } = await client.query(
    `SELECT tc.table_name AS referencing_table, kcu.column_name AS referencing_column,
            ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_schema = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
    [SCHEMA],
  );
  const fksOutByTable = groupBy(allFks, 'referencing_table');
  const fksInByTable = groupBy(allFks, 'referenced_table');

  const glosarioTablas = existsSync(GLOSARIO_DIR)
    ? new Set(readdirSync(GLOSARIO_DIR).map((f) => f.replace(/\.md$/, '')))
    : new Set();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const table of tableNames) {
    const md = buildNote({
      table,
      columns: columnsByTable.get(table) || [],
      pkCols: pkColsByTable.get(table) || new Set(),
      fksOut: fksOutByTable.get(table) || [],
      fksIn: fksInByTable.get(table) || [],
      hasGotcha: glosarioTablas.has(table),
    });
    writeFileSync(join(OUT_DIR, `${table}.md`), md, 'utf8');
  }

  await client.end();
  console.log(`Listo: ${tableNames.length} notas generadas en ${OUT_DIR}`);

  if (AUTO_COMMIT) commitYPush();
}

function commitYPush() {
  const vaultDir = dirname(OUT_DIR);
  const isGitRepo = existsSync(join(vaultDir, '.git'));
  if (!isGitRepo) {
    console.log(`(${vaultDir} no es un repo git - se omite commit automático)`);
    return;
  }
  try {
    execSync('git add _Schema-Completo', { cwd: vaultDir, stdio: 'inherit' });
    const hasChanges = execSync('git status --porcelain -- _Schema-Completo', { cwd: vaultDir })
      .toString().trim().length > 0;
    if (!hasChanges) {
      console.log('Sin cambios respecto al último commit - nada que publicar.');
      return;
    }
    execSync(`git commit -m "Refrescar _Schema-Completo (${new Date().toISOString().split('T')[0]})"`, {
      cwd: vaultDir, stdio: 'inherit',
    });
    execSync('git push origin main', { cwd: vaultDir, stdio: 'inherit' });
    console.log('Publicado en el remote del vault.');
  } catch (err) {
    console.error('No se pudo commitear/pushear automáticamente:', err.message);
    console.error(`Podés hacerlo a mano: cd ${vaultDir} && git add _Schema-Completo && git commit -m "..." && git push`);
  }
}

function buildNote({ table, columns, pkCols, fksOut, fksIn, hasGotcha }) {
  const lines = [];
  lines.push('---');
  lines.push('tags: [schema-tabla]');
  lines.push(`generado: ${new Date().toISOString().split('T')[0]}`);
  lines.push('---', '');
  lines.push(`# ${table}`, '');

  if (hasGotcha) {
    lines.push(`> ⚠️ Esta tabla tiene una nota de gotcha curada a mano: [[${table}]] (ver _Glosario-Tablas/)`, '');
  }

  lines.push('## Columnas', '');
  lines.push('| Columna | Tipo | Nullable | Default | PK |');
  lines.push('|---|---|---|---|---|');
  for (const c of columns) {
    const pk = pkCols.has(c.column_name) ? '🔑' : '';
    const def = c.column_default ? `\`${String(c.column_default).slice(0, 40)}\`` : '';
    lines.push(`| ${c.column_name} | ${c.data_type} | ${c.is_nullable} | ${def} | ${pk} |`);
  }

  if (fksOut.length) {
    lines.push('', '## Referencia a (FK saliente)', '');
    for (const fk of fksOut) {
      lines.push(`- \`${fk.referencing_column}\` → [[${fk.referenced_table}]].\`${fk.referenced_column}\``);
    }
  }

  if (fksIn.length) {
    lines.push('', '## Referenciada por (FK entrante)', '');
    const grouped = new Map();
    for (const fk of fksIn) {
      if (!grouped.has(fk.referencing_table)) grouped.set(fk.referencing_table, []);
      grouped.get(fk.referencing_table).push(fk.referencing_column);
    }
    for (const [refTable, cols] of grouped) {
      lines.push(`- [[${refTable}]] vía \`${cols.join(', ')}\``);
    }
  }

  return lines.join('\n') + '\n';
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
