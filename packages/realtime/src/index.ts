import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import * as Y from 'yjs'
import { setupWSConnection } from 'y-websocket/bin/utils'
import { auth } from '@notion-base/auth'
import { db } from '@notion-base/db'
import { workspaceMembers } from '@notion-base/db'
import { eq, and } from '@notion-base/db'

// In-memory document store (use Redis in production)
const docs = new Map<string, Y.Doc>()

function getOrCreateDoc(docName: string): Y.Doc {
  let doc = docs.get(docName)
  if (!doc) {
    doc = new Y.Doc()
    docs.set(docName, doc)
  }
  return doc
}

// Auth verification for WebSocket
async function verifyToken(token: string) {
  try {
    const session = await auth.api.getSession({ headers: new Headers({ cookie: `session=${token}` }) })
    return session
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, docs: docs.size }))
    return
  }

  // WebSocket upgrade handled by ws library
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', async (ws: WebSocket, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const token = url.searchParams.get('token')
  const docName = url.searchParams.get('doc') // e.g., "page:uuid" or "database:uuid"
  const workspaceId = url.searchParams.get('workspaceId')

  if (!token || !docName || !workspaceId) {
    ws.close(4001, 'Missing token, doc, or workspaceId parameter')
    return
  }

  const session = await verifyToken(token)
  if (!session) {
    ws.close(4001, 'Invalid token')
    return
  }

  // Verify workspace access
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.user_id, session.user.id),
      eq(workspaceMembers.workspace_id, workspaceId)
    ),
  })

  if (!membership) {
    ws.close(4003, 'No workspace access')
    return
  }

  const doc = getOrCreateDoc(docName)

  // Attach user info to ws for awareness
  ;(ws as any).user = {
    id: session.user.id,
    name: session.user.name ?? 'Anonymous',
    avatar: session.user.image,
  }

  setupWSConnection(ws, req, { doc, gc: true })
})

const PORT = Number(process.env.REALTIME_PORT ?? 3001)

server.listen(PORT, () => {
  console.log(`🔄 Realtime server running on ws://localhost:${PORT}/ws`)
  console.log(`   Connect with: ws://localhost:${PORT}/ws?token=<session>&doc=page:<pageId>&workspaceId=<workspaceId>`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down realtime server...')
  wss.close()
  server.close()
  process.exit(0)
})