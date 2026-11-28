import { z } from 'zod'
import { db, eq, and, desc, files } from '@notion-base/db'
import { workspaceProcedure, router } from '../trpc.js'

export const filesRouter = router({
  // Get upload URL (presigned S3/R2)
  getUploadUrl: workspaceProcedure
    .input(z.object({
      filename: z.string(),
      mimeType: z.string(),
      size: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      // In production: generate presigned URL for S3/R2
      // For now return mock
      const fileId = crypto.randomUUID()
      const uploadUrl = `https://upload.example.com/${fileId}?signature=mock`
      const publicUrl = `https://cdn.example.com/${fileId}`

      await db.insert(files).values({
        id: fileId,
        workspace_id: ctx.workspaceId,
        uploaded_by: ctx.user!.id,
        filename: input.filename,
        mime_type: input.mimeType,
        size: input.size,
        url: publicUrl,
      })

      return { uploadUrl, fileId, publicUrl }
    }),

  // Confirm upload
  confirmUpload: workspaceProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const file = await db.query.files.findFirst({
        where: and(eq(files.id, input.fileId), eq(files.workspace_id, ctx.workspaceId)),
      })
      if (!file) throw new Error('FILE_NOT_FOUND')
      return file
    }),

  // List files
  list: workspaceProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().nonnegative().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const fileList = await db.query.files.findMany({
        where: eq(files.workspace_id, ctx.workspaceId),
        orderBy: (files, { desc }) => [desc(files.created_at)],
        limit: input.limit,
        offset: input.offset,
      })
      return fileList
    }),

  // Delete file
  delete: workspaceProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(files).where(
        and(eq(files.id, input.fileId), eq(files.workspace_id, ctx.workspaceId))
      )
      return { success: true }
    }),
})