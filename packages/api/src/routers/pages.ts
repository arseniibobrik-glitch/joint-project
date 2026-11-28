import { z } from 'zod'
import { db, eq, and, asc, inArray, pages, blocks } from '@notion-base/db'
import { workspaceProcedure, router } from '../trpc.js'
import { CreatePageInputSchema, PageSchema } from '@notion-base/shared'

export const pagesRouter = router({
  // Get page tree for workspace
  tree: workspaceProcedure
    .query(async ({ ctx }) => {
      const allPages = await db.query.pages.findMany({
        where: eq(pages.workspace_id, ctx.workspaceId),
        orderBy: asc(pages.created_at),
      })

      // Build tree
      const pageMap = new Map(allPages.map(p => [p.id, { ...p, children: [] as typeof allPages }]))
      const roots: typeof allPages = []

      for (const page of allPages) {
        if (page.parent_id) {
          const parent = pageMap.get(page.parent_id)
          if (parent) parent.children.push(pageMap.get(page.id)!)
        } else {
          roots.push(pageMap.get(page.id)!)
        }
      }

      return roots
    }),

  // Get single page with blocks
  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const page = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.id), eq(pages.workspace_id, ctx.workspaceId)),
        with: {
          blocks: {
            orderBy: asc(pages.created_at), // blocks don't have created_at in with, fix below
          },
        },
      })
      if (!page) throw new Error('PAGE_NOT_FOUND')

      // Fetch blocks separately
      const pageBlocks = await db.query.blocks.findMany({
        where: and(eq(pages.id, input.id), eq(pages.workspace_id, ctx.workspaceId)),
        orderBy: asc(pages.created_at),
      })

      return { ...page, blocks: pageBlocks }
    }),

  // Create page
  create: workspaceProcedure
    .input(CreatePageInputSchema)
    .mutation(async ({ input, ctx }) => {
      if (input.parent_id) {
        const parent = await db.query.pages.findFirst({
          where: and(eq(pages.id, input.parent_id), eq(pages.workspace_id, ctx.workspaceId)),
        })
        if (!parent) throw new Error('PARENT_PAGE_NOT_FOUND')
      }

      const newPage = await db.insert(pages).values({
        ...input,
        workspace_id: ctx.workspaceId,
        created_by: ctx.user!.id,
      }).returning()

      return newPage[0]
    }),

  // Update page
  update: workspaceProcedure
    .input(PageSchema.partial().required({ id: true }))
    .mutation(async ({ input, ctx }) => {
      const { id, created_at, ...data } = input

      const existing = await db.query.pages.findFirst({
        where: and(eq(pages.id, id), eq(pages.workspace_id, ctx.workspaceId)),
      })
      if (!existing) throw new Error('PAGE_NOT_FOUND')

      const updated = await db
        .update(pages)
        .set({ ...data, updated_at: new Date() })
        .where(eq(pages.id, id))
        .returning()

      return updated[0]
    }),

  // Delete page (and all children recursively)
  delete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const page = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.id), eq(pages.workspace_id, ctx.workspaceId)),
      })
      if (!page) throw new Error('PAGE_NOT_FOUND')

      // Get all descendant page IDs
      const descendantIds = await getDescendantPageIds(db, input.id, ctx.workspaceId)
      const allIds = [input.id, ...descendantIds]

      // Delete blocks for all pages
      await db.delete(pages).where(
        and(inArray(pages.id, allIds), eq(pages.workspace_id, ctx.workspaceId))
      )

      return { success: true, deletedCount: allIds.length }
    }),

  // Move page
  move: workspaceProcedure
    .input(z.object({
      id: z.string().uuid(),
      newParentId: z.string().uuid().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const page = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.id), eq(pages.workspace_id, ctx.workspaceId)),
      })
      if (!page) throw new Error('PAGE_NOT_FOUND')

      if (input.newParentId) {
        const newParent = await db.query.pages.findFirst({
          where: and(eq(pages.id, input.newParentId), eq(pages.workspace_id, ctx.workspaceId)),
        })
        if (!newParent) throw new Error('NEW_PARENT_NOT_FOUND')
        // Prevent circular reference
        if (await isDescendant(db, input.id, input.newParentId, ctx.workspaceId)) {
          throw new Error('CIRCULAR_REFERENCE')
        }
      }

      const updated = await db
        .update(pages)
        .set({ parent_id: input.newParentId, updated_at: new Date() })
        .where(eq(pages.id, input.id))
        .returning()

      return updated[0]
    }),

  // Duplicate page (with blocks)
  duplicate: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const page = await db.query.pages.findFirst({
        where: and(eq(pages.id, input.id), eq(pages.workspace_id, ctx.workspaceId)),
        with: { blocks: true },
      })
      if (!page) throw new Error('PAGE_NOT_FOUND')

      const newPage = await db.insert(pages).values({
        ...page,
        id: undefined,
        workspace_id: ctx.workspaceId,
        created_by: ctx.user!.id,
        created_at: new Date(),
        updated_at: new Date(),
        title: [{ ...page.title[0], text: { ...page.title[0].text, content: `${page.title[0].text.content} (copy)` } }],
      }).returning()

      // Duplicate blocks
      for (const block of page.blocks) {
        await db.insert(blocks).values({
          ...block,
          id: undefined,
          workspace_id: ctx.workspaceId,
          created_by: ctx.user!.id,
          parent_id: newPage[0].id,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }

      return newPage[0]
    }),
})

// Helper functions
async function getDescendantPageIds(db: any, pageId: string, workspaceId: string): Promise<string[]> {
  const children = await db.query.pages.findMany({
    where: and(eq(pages.parent_id, pageId), eq(pages.workspace_id, workspaceId)),
  })

  let allIds: string[] = []
  for (const child of children) {
    allIds.push(child.id)
    allIds = allIds.concat(await getDescendantPageIds(db, child.id, workspaceId))
  }
  return allIds
}

async function isDescendant(dbInstance: typeof db, ancestorId: string, descendantId: string, workspaceId: string): Promise<boolean> {
  let currentId: string | null = descendantId
  while (currentId) {
    if (currentId === ancestorId) return true
    const page: { parent_id: string | null } | undefined = await dbInstance.query.pages.findFirst({
      where: and(eq(pages.id, currentId), eq(pages.workspace_id, workspaceId)),
      columns: { parent_id: true },
    })
    currentId = page?.parent_id ?? null
  }
  return false
}

// blocks imported above