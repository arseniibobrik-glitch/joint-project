import { router } from '../trpc'
import { blocksRouter } from './blocks'
import { pagesRouter } from './pages'
import { databasesRouter } from './databases'
import { workspacesRouter } from './workspaces'

export const appRouter = router({
  blocks: blocksRouter,
  pages: pagesRouter,
  databases: databasesRouter,
  workspaces: workspacesRouter,
})

export type AppRouter = typeof appRouter