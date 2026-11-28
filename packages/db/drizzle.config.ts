import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: 'localhost',
    port: 5432,
    user: 'notion',
    password: 'notion',
    database: 'notion_base',
  },
  verbose: true,
  strict: true,
})