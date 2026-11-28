import { z } from 'zod'
import { db, eq, and, desc, asc, sql, inArray, blocks, pages } from '@notion-base/db'
import { workspaceProcedure, router } from '../trpc.js'
import {
  CreateBlockInputSchema,
  UpdateBlockInputSchema,
  BlockTypeSchema,
  BlockSchema,
} from '@notion-base/shared'

export const blocksRouter = router({
  // Get blocks for a page (flat list, ordered by index)
  list: workspaceProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const page = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.pageId), eq(pages.workspace_id, ctx.workspaceId)),
      })
      if (!page) throw new Error('PAGE_NOT_FOUND')

      const pageBlocks = await db.query.blocks.findMany({
        where: and(
          eq(blocks.parent_id, input.pageId),
          eq(blocks.workspace_id, ctx.workspaceId)
        ),
        orderBy: asc(blocks.index),
      })

      return pageBlocks
    }),

  // Get single block
  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.id, input.id), eq(blocks.workspace_id, ctx.workspaceId)),
      })
      if (!block) throw new Error('BLOCK_NOT_FOUND')
      return block
    }),

  // Create block
  create: workspaceProcedure
    .input(CreateBlockInputSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify parent page exists in workspace
      const parentPage = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.parent_id), eq(pages.workspace_id, ctx.workspaceId)),
      })
      if (!parentPage) throw new Error('PARENT_PAGE_NOT_FOUND')

      // Get max index for positioning
      const maxIndex = await db
        .select({ max: sql<number>`max(${blocks.index})` })
        .from(blocks)
        .where(and(eq(blocks.parent_id, input.parent_id), eq(blocks.workspace_id, ctx.workspaceId)))

      const newBlock = await db.insert(blocks).values({
        ...input,
        workspace_id: ctx.workspaceId,
        created_by: ctx.user!.id,
        index: (maxIndex[0]?.max ?? -1) + 1,
      }).returning()

      return newBlock[0]
    }),

  // Update block (with optimistic locking via version)
  update: workspaceProcedure
    .input(UpdateBlockInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, version, ...data } = input

      const existing = await db.query.blocks.findFirst({
        where: and(eq(blocks.id, id), eq(blocks.workspace_id, ctx.workspaceId)),
      })
      if (!existing) throw new Error('BLOCK_NOT_FOUND')
      if (existing.version !== version) throw new Error('VERSION_CONFLICT')

      const updated = await db
        .update(blocks)
        .set({ ...data, version: version + 1, updated_at: new Date() })
        .where(eq(blocks.id, id))
        .returning()

      return updated[0]
    }),

  // Delete block (soft delete - move to trash or mark archived)
  delete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.query.blocks.findFirst({
        where: and(eq(blocks.id, input.id), eq(blocks.workspace_id, ctx.workspaceId)),
      })
      if (!existing) throw new Error('BLOCK_NOT_FOUND')

      // Hard delete for now; could add is_archived column
      await db.delete(blocks).where(eq(blocks.id, input.id))

      // Re-index siblings
      await db
        .update(blocks)
        .set({ index: sql`${blocks.index} - 1` })
        .where(
          and(
            eq(blocks.parent_id, existing.parent_id),
            eq(blocks.workspace_id, ctx.workspaceId),
            sql`${blocks.index} > ${existing.index}`
          )
        )

      return { success: true }
    }),

  // Move block (change parent and/or index)
  move: workspaceProcedure
    .input(z.object({
      id: z.string().uuid(),
      newParentId: z.string().uuid(),
      newIndex: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.id, input.id), eq(blocks.workspace_id, ctx.workspaceId)),
      })
      if (!block) throw new Error('BLOCK_NOT_FOUND')

      // Verify new parent is in same workspace
      const newParentPage = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.newParentId), eq(pages.workspace_id, ctx.workspaceId)),
      })
      if (!newParentPage) throw new Error('NEW_PARENT_NOT_FOUND')

      const oldParentId = block.parent_id
      const oldIndex = block.index

      // Shift siblings in old parent
      await db
        .update(blocks)
        .set({ index: sql`${blocks.index} - 1` })
        .where(
          and(
            eq(blocks.parent_id, oldParentId),
            eq(blocks.workspace_id, ctx.workspaceId),
            sql`${blocks.index} > ${oldIndex}`
          )
        )

      // Shift siblings in new parent
      await db
        .update(blocks)
        .set({ index: sql`${blocks.index} + 1` })
        .where(
          and(
            eq(blocks.parent_id, input.newParentId),
            eq(blocks.workspace_id, ctx.workspaceId),
            sql`${blocks.index} >= ${input.newIndex}`
          )
        )

      const moved = await db
        .update(blocks)
        .set({
          parent_id: input.newParentId,
          index: input.newIndex,
          updated_at: new Date(),
        })
        .where(eq(blocks.id, input.id))
        .returning()

      return moved[0]
    }),

  // Duplicate block
  duplicate: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.id, input.id), eq(blocks.workspace_id, ctx.workspaceId)),
      })
      if (!block) throw new Error('BLOCK_NOT_FOUND')

      const maxIndex = await db
        .select({ max: sql<number>`max(${blocks.index})` })
        .from(blocks)
        .where(and(eq(blocks.parent_id, block.parent_id), eq(blocks.workspace_id, ctx.workspaceId)))

      const duplicated = await db.insert(blocks).values({
        type: block.type,
        parent_id: block.parent_id,
        workspace_id: ctx.workspaceId,
        created_by: ctx.user!.id,
        content: block.content,
        properties: block.properties,
        index: (maxIndex[0]?.max ?? -1) + 1,
        has_children: block.has_children,
      }).returning()

      return duplicated[0]
    }),
})