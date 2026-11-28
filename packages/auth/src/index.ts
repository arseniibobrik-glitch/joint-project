import { betterAuth } from 'better-auth'
import { db, users, workspaces, workspaceMembers } from '@notion-base/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth: any = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    model: users,
    fields: {
      email: 'email',
      name: 'name',
      avatarUrl: 'avatar_url',
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    after: [
      {
        matcher: (ctx: { path: string }) => ctx.path === '/sign-up/email',
        handler: async (ctx: { returned: { user: { id: string; name: string | null; email: string } } }) => {
          const user = ctx.returned.user
          const workspace = await db.insert(workspaces).values({
            name: `${user.name ?? user.email.split('@')[0]}'s Workspace`,
            owner_id: user.id,
          }).returning({ id: workspaces.id })

          await db.insert(workspaceMembers).values({
            workspace_id: workspace[0].id,
            user_id: user.id,
            role: 'owner',
          })
        },
      },
    ],
  },
})

export type Session = {
  id: string
  userId: string
  expiresAt: Date
  ipAddress?: string | null
  userAgent?: string | null
}

export type User = {
  id: string
  email: string
  emailVerified: boolean
  name: string
  createdAt: Date
  updatedAt: Date
  image?: string | null
}