import Fastify from 'fastify'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import cors from '@fastify/cors'
import { appRouter } from './routers'
import { createContext } from './trpc'
import { auth } from '@notion-base/auth'

const server = Fastify({ logger: true })

await server.register(cors, {
  origin: true,
  credentials: true,
})

// BetterAuth routes
server.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  handler: async (request, reply) => {
    const response = await auth.handler(request.raw)
    reply.status(response.status)
    for (const [key, value] of response.headers.entries()) {
      reply.header(key, value)
    }
    return response.body
  },
})

// tRPC
await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
})

// Health check
server.get('/health', async () => ({ ok: true }))

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'

try {
  await server.listen({ port: PORT, host: HOST })
  console.log(`🚀 API server running at http://${HOST}:${PORT}`)
  console.log(`   tRPC: http://${HOST}:${PORT}/trpc`)
  console.log(`   Auth: http://${HOST}:${PORT}/api/auth`)
} catch (err) {
  server.log.error(err)
  process.exit(1)
}