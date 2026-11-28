import { betterAuth } from 'better-auth'
import { db } from '@notion-base/db'
import { users, workspaces, workspaceMembers } from '@notion-base/db/schema'

export const auth = betterAuth({
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
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  hooks: {
    after: [
      {
        matcher: (ctx) => ctx.path === '/sign-up/email',
        handler: async (ctx) => {
          // Create personal workspace for new user
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

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.User