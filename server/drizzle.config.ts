// `pnpm db:pull` genera src/db/schema.ts desde la base ya migrada (AD-06).
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  out: './src/db',
  schemaFilter: ['piloto'],
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
