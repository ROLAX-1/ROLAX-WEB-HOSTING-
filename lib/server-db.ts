import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  rolaxPrisma?: PrismaClient;
  rolaxUsersTable?: Promise<void>;
  rolaxTelegramStateTable?: Promise<void>;
};

/** The app can still run in local/demo mode, but never pretends that mode is durable. */
export function databaseConfigured() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

export function getPrisma(): PrismaClient | null {
  if (!databaseConfigured()) return null;
  if (!globalForPrisma.rolaxPrisma) globalForPrisma.rolaxPrisma = new PrismaClient();
  return globalForPrisma.rolaxPrisma;
}

/**
 * The repository already contains a Prisma schema, but old deployments may not
 * have run a migration. Creating only the User table/columns is additive and
 * lets registration start working immediately after DATABASE_URL is supplied.
 * It never drops or truncates existing data.
 */
export async function ensureUsersTable(db: PrismaClient) {
  if (!globalForPrisma.rolaxUsersTable) {
    globalForPrisma.rolaxUsersTable = (async () => {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "isAdmin" BOOLEAN NOT NULL DEFAULT false,
          "planId" TEXT,
          "planExpiry" TIMESTAMP(3),
          "status" TEXT NOT NULL DEFAULT 'active',
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "User_pkey" PRIMARY KEY ("id")
        )
      `);
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
      await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "metadata" JSONB`);
      await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active'`);
      await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planId" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planExpiry" TIMESTAMP(3)`);
    })().catch(error => {
      globalForPrisma.rolaxUsersTable = undefined;
      throw error;
    });
  }
  await globalForPrisma.rolaxUsersTable;
}

/** Additive table for a full Telegram user snapshot when a database is attached. */
export async function ensureTelegramStateTable(db: PrismaClient) {
  if (!globalForPrisma.rolaxTelegramStateTable) {
    globalForPrisma.rolaxTelegramStateTable = (async () => {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TelegramState" (
          "id" TEXT NOT NULL,
          "payload" JSONB NOT NULL,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TelegramState_pkey" PRIMARY KEY ("id")
        )
      `);
    })().catch(error => {
      globalForPrisma.rolaxTelegramStateTable = undefined;
      throw error;
    });
  }
  await globalForPrisma.rolaxTelegramStateTable;
}
