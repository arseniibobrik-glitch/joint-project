declare module 'y-websocket/bin/utils' {
  import { WebSocket } from 'ws'
  import * as Y from 'yjs'
  import { IncomingMessage } from 'http'

  export interface SetupWSConnectionOptions {
    doc: Y.Doc
    gc?: boolean
    getDoc?: (docName: string) => Y.Doc
    authenticate?: (token: string) => Promise<boolean>
  }

  export function setupWSConnection(
    ws: WebSocket,
    req: IncomingMessage,
    options: SetupWSConnectionOptions
  ): void
}