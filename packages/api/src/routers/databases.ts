import { z } from 'zod'
import { db, eq, and, desc, asc, sql, inArray } from '@notion-base/db'
import { databases, databaseRows, pages } from '@notion-base/db/schema'
import { workspaceProcedure, router } from '../trpc'
import { DatabaseSchema, DatabasePropertySchema, DatabaseRowSchema, QueryDatabaseInputSchema } from '@notion-base/shared'

export const databasesRouter = router({
  // Get database by ID
  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const database = await db.query.databases.findFirst({
        where: and(eq(databases.id, input.id), eq(databases.workspace_id, ctx.workspaceId)),
      })
      if (!database) throw new Error('DATABASE_NOT_FOUND')
      return database
    }),

  // Get database with rows (paginated)
  getWithRows: workspaceProcedure
    .input(z.object({
      id: z.string().uuid(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().nonnegative().default(0),
      sorts: z.array(z.object({ property: z.string(), direction: z.enum(['asc', 'desc']) })).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const database = await db.query.databases.findFirst({
        where: and(eq(databases.id, input.id), eq(databases.workspace_id, ctx.workspaceId)),
      })
      if (!database) throw new Error('DATABASE_NOT_FOUND')

      // Build order by clause
      const orderBy = input.sorts?.length
        ? input.sorts.map(s => s.direction === 'asc' ? asc(sql`${databaseRows.properties}->>${s.property}`) : desc(sql`${databaseRows.properties}->>${s.property}`))
        : [asc(databaseRows.created_at)]

      const rows = await db.query.databaseRows.findMany({
        where: and(eq(databaseRows.database_id, input.id)),
        orderBy,
        limit: input.limit,
        offset: input.offset,
      })

      const total = await db.$count(databaseRows, eq(databaseRows.database_id, input.id))

      return { database, rows, total, hasMore: input.offset + rows.length < total }
    }),

  // Create database
  create: workspaceProcedure
    .input(DatabaseSchema.omit({ id: true, created_at: true, updated_at: true, created_by: true }))
    .mutation(async ({ input, ctx }) => {
      const parentPage = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.parent_page_id), eq(pages.workspace_id, ctx.workspaceId)),
      })
      if (!parentPage) throw new Error('PARENT_PAGE_NOT_FOUND')

      const newDatabase = await db.insert(databases).values({
        ...input,
        workspace_id: ctx.workspaceId,
        created_by: ctx.user!.id,
      }).returning()

      return newDatabase[0]
    }),

  // Update database (properties, views, etc.)
  update: workspaceProcedure
    .input(DatabaseSchema.partial().required({ id: true }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input

      const existing = await db.query.databases.findFirst({
        where: and(eq(databases.id, id), eq(databases.workspace_id, ctx.workspaceId)),
      })
      if (!existing) throw new Error('DATABASE_NOT_FOUND')

      const updated = await db
        .update(databases)
        .set({ ...data, updated_at: new Date() })
        .where(eq(databases.id, id))
        .returning()

      return updated[0]
    }),

  // Delete database
  delete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.query.databases.findFirst({
        where: and(eq(databases.id, input.id), eq(databases.workspace_id, ctx.workspaceId)),
      })
      if (!existing) throw new Error('DATABASE_NOT_FOUND')

      await db.delete(databases).where(eq(databases.id, input.id))
      return { success: true }
    }),

  // Query database rows with filter/sort (Notion-style)
  query: workspaceProcedure
    .input(QueryDatabaseInputSchema)
    .query(async ({ input, ctx }) => {
      const database = await db.query.databases.findFirst({
        where: and(eq(databases.id, input.database_id), eq(databases.workspace_id, ctx.workspaceId)),
      })
      if (!database) throw new Error('DATABASE_NOT_FOUND')

      // Build where clause from filter
      // Simplified - in production, parse Notion filter AST
      const where = eq(databaseRows.database_id, input.database_id)

      // Build order by
      const orderBy = input.sorts?.length
        ? input.sorts.map(s => s.direction === 'asc'
            ? asc(sql`${databaseRows.properties}->>${s.property}`)
            : desc(sql`${databaseRows.properties}->>${s.property}`))
        : [asc(databaseRows.created_at)]

      const rows = await db.query.databaseRows.findMany({
        where,
        orderBy,
        limit: input.page_size,
        offset: input.start_cursor ? parseInt(input.start_cursor) : 0,
      })

      return {
        results: rows,
        next_cursor: rows.length === input.page_size
          ? String((input.start_cursor ? parseInt(input.start_cursor) : 0) + rows.length)
          : undefined,
        has_more: rows.length === input.page_size,
      }
    }),

  // Create row
  createRow: workspaceProcedure
    .input(z.object({
      databaseId: z.string().uuid(),
      properties: z.record(z.unknown()),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await db.query.databases.findFirst({
        where: and(eq(databases.id, input.databaseId), eq(databases.workspace_id, ctx.workspaceId)),
      })
      if (!database) throw new Error('DATABASE_NOT_FOUND')

      const row = await db.insert(databaseRows).values({
        database_id: input.databaseId,
        created_by: ctx.user!.id,
        properties: input.properties,
      }).returning()

      return row[0]
    }),

  // Update row
  updateRow: workspaceProcedure
    .input(z.object({
      id: z.string().uuid(),
      databaseId: z.string().uuid(),
      properties: z.record(z.unknown()),
    }))
    .mutation(async ({ input, ctx }) => {
      const row = await db.query.databaseRows.findFirst({
        where: and(eq(databaseRows.id, input.id), eq(databaseRows.database_id, input.databaseId)),
      })
      if (!row) throw new Error('ROW_NOT_FOUND')

      const updated = await db
        .update(databaseRows)
        .set({ properties: input.properties, updated_at: new Date() })
        .where(eq(databaseRows.id, input.id))
        .returning()

      return updated[0]
    }),

  // Delete row
  deleteRow: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), databaseId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(databaseRows).where(
        and(eq(databaseRows.id, input.id), eq(databaseRows.database_id, input.databaseId))
      )
      return { success: true }
    }),

  // Batch create rows
  batchCreateRows: workspaceProcedure
    .input(z.object({
      databaseId: z.string().uuid(),
      rows: z.array(z.record(z.unknown())).min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const database = await db.query.databases.findFirst({
        where: and(eq(databases.id, input.databaseId), eq(databases.workspace_id, ctx.workspaceId)),
      })
      if (!database) throw new Error('DATABASE_NOT_FOUND')

      const rows = await db.insert(databaseRows).values(
        input.rows.map(props => ({
          database_id: input.databaseId,
          created_by: ctx.user!.id,
          properties: props,
        }))
      ).returning()

      return rows
    }),
})