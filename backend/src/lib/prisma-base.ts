/**
 * Bare PrismaClient singleton — used internally by services that MUST NOT
 * trigger the audit extension.
 *
 * Currently the audit logger itself (services/audit.ts) writes via this
 * client; otherwise every audit insert would itself be auto-audited and
 * recurse forever. App code should import from `./prisma`, not from here.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { config } from '../config';

const logEvents: Prisma.LogLevel[] = config.isDev ? ['error', 'warn'] : ['error'];

declare global {
  // eslint-disable-next-line no-var
  var __rawPrismaClient: PrismaClient | undefined;
}

export const rawPrisma: PrismaClient =
  globalThis.__rawPrismaClient ??
  new PrismaClient({ log: logEvents });

if (config.isDev) {
  globalThis.__rawPrismaClient = rawPrisma;
}
