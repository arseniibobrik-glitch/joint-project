import { z } from 'zod'
import { db, eq, and, workspaces, workspaceMembers, users } from '@notion-base/db'
import { workspaceProcedure, router, protectedProcedure } from '../trpc.js'

export const workspacesRouter = router({
  // Get current user's workspaces
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.user_id, ctx.user!.id),
      with: { workspace: true },
    })
    return memberships.map(m => m.workspace)
  }),

  // Get workspace by ID
  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const workspace = await db.query.workspaces.findFirst({
        where: and(eq(workspaces.id, input.id), eq(workspaces.id, ctx.workspaceId)),
      })
      if (!workspace) throw new Error('WORKSPACE_NOT_FOUND')
      return workspace
    }),

  // Create workspace
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const workspace = await db.insert(workspaces).values({
        name: input.name,
        owner_id: ctx.user!.id,
      }).returning()

      await db.insert(workspaceMembers).values({
        workspace_id: workspace[0].id,
        user_id: ctx.user!.id,
        role: 'owner',
      })

      return workspace[0]
    }),

  // Update workspace
  update: workspaceProcedure
    .input(z.object({
      name: z.string().min(1).max(100).optional(),
      icon: z.string().nullable().optional(),
      settings: z.object({
        allow_public_pages: z.boolean().optional(),
        allow_guests: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updated = await db
        .update(workspaces)
        .set({ ...input, updated_at: new Date() })
        .where(eq(workspaces.id, ctx.workspaceId))
        .returning()

      return updated[0]
    }),

  // Invite member
  inviteMember: workspaceProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'member', 'guest']).default('member'),
    }))
    .mutation(async ({ input, ctx }) => {
      const invitee = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      })
      if (!invitee) throw new Error('USER_NOT_FOUND')

      const existing = await db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspace_id, ctx.workspaceId),
          eq(workspaceMembers.user_id, invitee.id)
        ),
      })
      if (existing) throw new Error('ALREADY_MEMBER')

      const member = await db.insert(workspaceMembers).values({
        workspace_id: ctx.workspaceId,
        user_id: invitee.id,
        role: input.role,
      }).returning()

      return member[0]
    }),

  // List members
  listMembers: workspaceProcedure.query(async ({ ctx }) => {
    const members = await db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspace_id, ctx.workspaceId),
      with: { user: true },
    })
    return members
  }),

  // Update member role
  updateMemberRole: workspaceProcedure
    .input(z.object({
      userId: z.string().uuid(),
      role: z.enum(['admin', 'member', 'guest']),
    }))
    .mutation(async ({ input, ctx }) => {
      const member = await db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspace_id, ctx.workspaceId),
          eq(workspaceMembers.user_id, input.userId)
        ),
      })
      if (!member) throw new Error('MEMBER_NOT_FOUND')

      // Prevent demoting last owner
      // input.role is 'admin' | 'member' | 'guest' - never 'owner'
      // So if member is owner, we're always demoting them
      if (member.role === 'owner') {
        const owners = await db.query.workspaceMembers.findMany({
          where: and(
            eq(workspaceMembers.workspace_id, ctx.workspaceId),
            eq(workspaceMembers.role, 'owner')
          ),
        })
        if (owners.length <= 1) throw new Error('CANNOT_REMOVE_LAST_OWNER')
      }

      const updated = await db
        .update(workspaceMembers)
        .set({ role: input.role })
        .where(and(
          eq(workspaceMembers.workspace_id, ctx.workspaceId),
          eq(workspaceMembers.user_id, input.userId)
        ))
        .returning()

      return updated[0]
    }),

  // Remove member
  removeMember: workspaceProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const member = await db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspace_id, ctx.workspaceId),
          eq(workspaceMembers.user_id, input.userId)
        ),
      })
      if (!member) throw new Error('MEMBER_NOT_FOUND')
      if (member.role === 'owner') throw new Error('CANNOT_REMOVE_OWNER')

      await db.delete(workspaceMembers).where(and(
        eq(workspaceMembers.workspace_id, ctx.workspaceId),
        eq(workspaceMembers.user_id, input.userId)
      ))

      return { success: true }
    }),
})