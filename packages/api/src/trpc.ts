import { initTRPC } from '@trpc/server'
import { ZodError } from 'zod'
import { auth } from '@notion-base/auth'
import type { Session, User } from '@notion-base/auth'

export interface Context {
  session: Session | null
  user: User | null
  workspaceId: string | null
}

export const createContext = async (opts: { headers: Headers }): Promise<Context> => {
  const session = await auth.api.getSession({ headers: opts.headers })
  return {
    session: session?.session ?? null,
    user: session?.user ?? null,
    workspaceId: session?.session?.activeWorkspaceId ?? null,
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