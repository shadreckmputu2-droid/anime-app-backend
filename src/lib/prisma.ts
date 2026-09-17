// Prisma Client singleton.
//
// Prisma 7 requires a driver adapter — plain `new PrismaClient()` no longer
// works. We use @prisma/adapter-pg (node-postgres) since we're on Postgres.
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

// Reuse a single instance across hot-reloads in dev (ts-node-dev/nodemon)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
  })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}