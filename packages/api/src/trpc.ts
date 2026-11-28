import { initTRPC } from '@trpc/server'
import { ZodError } from 'zod'
import { auth } from '@notion-base/auth'
import type { FastifyRequest, FastifyReply } from 'fastify'

export interface Context {
  session: { id: string; userId: string; expiresAt: Date } | null
  user: { id: string; email: string; name: string | null } | null
  workspaceId: string | null
}

export const createContext = async (opts: { req: FastifyRequest; res: FastifyReply }): Promise<Context> => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(opts.req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value[0])
  }
  const session = await auth.api.getSession({ headers })
  // Get workspace from header
  const workspaceId = headers.get('x-workspace-id') ?? null
  return {
    session: session?.session ?? null,
    user: session?.user ?? null,
    workspaceId,
  }
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new Error('UNAUTHORIZED')
  }
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.user } })
})

export const workspaceProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.workspaceId) {
    throw new Error('NO_WORKSPACE')
  }
  return next({ ctx: { ...ctx, workspaceId: ctx.workspaceId } })
})

export const middleware = t.middleware