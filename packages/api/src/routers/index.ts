import { router } from '../trpc.js'
import { blocksRouter } from './blocks.js'
import { pagesRouter } from './pages.js'
import { databasesRouter } from './databases.js'
import { workspacesRouter } from './workspaces.js'

export const appRouter = router({
  blocks: blocksRouter,
  pages: pagesRouter,
  databases: databasesRouter,
  workspaces: workspacesRouter,
})

export type AppRouter = typeof appRouter