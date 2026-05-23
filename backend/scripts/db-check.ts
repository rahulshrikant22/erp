/**
 * Connection + sanity check for the ERP database.
 *
 * Run via: `npm run db:check` (loads ../.env via dotenv-cli).
 *
 * Reports:
 *   - PostgreSQL version
 *   - Database name
 *   - Schemas present
 *   - Table count in `core`
 *   - Seed counts (org, system roles, modules, numbering series, system settings)
 * Exits 1 on any failure.
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [{ version }] = await prisma.$queryRawUnsafe<{ version: string }[]>(
      'SELECT version()',
    );
    const [{ current_database }] = await prisma.$queryRawUnsafe<
      { current_database: string }[]
    >('SELECT current_database()');

    const schemas = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT LIKE 'pg_%'
         AND schema_name <> 'information_schema'
       ORDER BY schema_name`,
    );

    const [{ count: tableCount }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count
         FROM information_schema.tables
        WHERE table_schema = 'core'`,
    );

    const [orgs, roles, modules, numSeries, settings] = await Promise.all([
      prisma.organization.count(),
      prisma.role.count({ where: { isSystemRole: true } }),
      prisma.module.count(),
      prisma.numberingSeries.count(),
      prisma.systemSetting.count(),
    ]);

    console.log('--- ERP DB connection report ---');
    console.log('postgres            :', version);
    console.log('database            :', current_database);
    console.log('schemas             :', schemas.map((s) => s.schema_name).join(', '));
    console.log('tables in core      :', Number(tableCount));
    console.log('organizations       :', orgs);
    console.log('system roles        :', roles);
    console.log('modules             :', modules);
    console.log('numbering series    :', numSeries);
    console.log('system settings     :', settings);
    console.log('--------------------------------');
    console.log('OK');
  } catch (err) {
    console.error('db-check FAILED:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
