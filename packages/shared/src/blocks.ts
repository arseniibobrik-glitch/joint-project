import { z } from 'zod'

// ============================================
// Block Types — exact Notion parity
// ============================================

export const BlockTypeSchema = z.enum([
  // Text
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  // Lists
  'bulleted_list',
  'numbered_list',
  'todo',
  // Media
  'image',
  'video',
  'file',
  'pdf',
  'bookmark',
  'embed',
  // Layout
  'column',
  'column_list',
  'divider',
  'callout',
  'quote',
  'code',
  // Tables
  'table',
  'table_row',
  // Databases
  'database',
  'database_view',
  // Advanced
  'synced_block',
  'link_preview',
  'breadcrumb',
  'table_of_contents',
  'equation',
])

export type BlockType = z.infer<typeof BlockTypeSchema>

// ============================================
// Block Content — per-type payload
// ============================================

export const RichTextSchema = z.object({
  type: z.literal('text'),
  text: z.object({ content: z.string(), link: z.object({ url: z.string() }).nullable() }),
  annotations: z.object({
    bold: z.boolean(),
    italic: z.boolean(),
    strikethrough: z.boolean(),
    underline: z.boolean(),
    code: z.boolean(),
    color: z.string(),
  }),
  plain_text: z.string(),
  href: z.string().nullable(),
})

export type RichText = z.infer<typeof RichTextSchema>

export const BlockContentSchema = z.discriminatedUnion('type', [
  // Text blocks
  z.object({ type: z.literal('paragraph'), rich_text: z.array(RichTextSchema), color: z.string().optional() }),
  z.object({ type: z.literal('heading1'), rich_text: z.array(RichTextSchema), color: z.string().optional(), is_toggleable: z.boolean().optional() }),
  z.object({ type: z.literal('heading2'), rich_text: z.array(RichTextSchema), color: z.string().optional(), is_toggleable: z.boolean().optional() }),
  z.object({ type: z.literal('heading3'), rich_text: z.array(RichTextSchema), color: z.string().optional(), is_toggleable: z.boolean().optional() }),
  // Lists
  z.object({ type: z.literal('bulleted_list'), rich_text: z.array(RichTextSchema), color: z.string().optional() }),
  z.object({ type: z.literal('numbered_list'), rich_text: z.array(RichTextSchema), color: z.string().optional() }),
  z.object({ type: z.literal('todo'), rich_text: z.array(RichTextSchema), checked: z.boolean(), color: z.string().optional() }),
  // Media
  z.object({ type: z.literal('image'), url: z.string(), caption: z.array(RichTextSchema).optional(), width: z.number().optional() }),
  z.object({ type: z.literal('video'), url: z.string(), caption: z.array(RichTextSchema).optional() }),
  z.object({ type: z.literal('file'), url: z.string(), name: z.string(), caption: z.array(RichTextSchema).optional() }),
  z.object({ type: z.literal('pdf'), url: z.string(), caption: z.array(RichTextSchema).optional() }),
  z.object({ type: z.literal('bookmark'), url: z.string(), caption: z.array(RichTextSchema).optional() }),
  z.object({ type: z.literal('embed'), url: z.string(), caption: z.array(RichTextSchema).optional() }),
  // Layout
  z.object({ type: z.literal('divider') }),
  z.object({ type: z.literal('callout'), rich_text: z.array(RichTextSchema), icon: z.object({ emoji: z.string() }).nullable(), color: z.string() }),
  z.object({ type: z.literal('quote'), rich_text: z.array(RichTextSchema), color: z.string().optional() }),
  z.object({ type: z.literal('code'), rich_text: z.array(RichTextSchema), language: z.string() }),
  // Tables
  z.object({ type: z.literal('table'), table_width: z.number(), has_column_header: z.boolean(), has_row_header: z.boolean() }),
  z.object({ type: z.literal('table_row'), cells: z.array(z.array(RichTextSchema)) }),
  // Databases
  z.object({ type: z.literal('database'), database_id: z.string() }),
  z.object({ type: z.literal('database_view'), database_id: z.string(), view_id: z.string() }),
  // Advanced
  z.object({ type: z.literal('synced_block'), synced_from: z.object({ block_id: z.string() }).nullable() }),
  z.object({ type: z.literal('link_preview'), url: z.string() }),
  z.object({ type: z.literal('breadcrumb') }),
  z.object({ type: z.literal('table_of_contents'), color: z.string().optional() }),
  z.object({ type: z.literal('equation'), expression: z.string() }),
])

export type BlockContent = z.infer<typeof BlockContentSchema>

// ============================================
// Core Block Schema
// ============================================

export const BlockSchema = z.object({
  id: z.string().uuid(),
  type: BlockTypeSchema,
  parent_id: z.string().uuid(), // page_id or block_id for nested
  workspace_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  version: z.number().int().nonnegative(), // optimistic locking
  content: BlockContentSchema,
  properties: z.record(z.unknown()).optional(), // for database rows
  // Positioning
  index: z.number().int().nonnegative(), // order among siblings
  // Nested children (loaded lazily)
  has_children: z.boolean().default(false),
})

export type Block = z.infer<typeof BlockSchema>

// ============================================
// Page Schema
// ============================================

export const PageSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(), // parent page or null for root
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  title: z.array(RichTextSchema),
  icon: z.object({ emoji: z.string() }).nullable(),
  cover: z.object({ url: z.string() }).nullable(),
  properties: z.record(z.unknown()).optional(), // database properties if page is a DB
  is_archived: z.boolean().default(false),
  is_published: z.boolean().default(false),
  public_url: z.string().nullable(),
  slug: z.string().optional(), // for published pages
})

export type Page = z.infer<typeof PageSchema>

// ============================================
// Database Schema
// ============================================

export const DatabasePropertyTypeSchema = z.enum([
  'title', 'rich_text', 'number', 'select', 'multi_select',
  'date', 'people', 'files', 'checkbox', 'url', 'email',
  'phone_number', 'formula', 'relation', 'rollup', 'created_time',
  'created_by', 'last_edited_time', 'last_edited_by', 'status', 'unique_id',
])

export const DatabasePropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: DatabasePropertyTypeSchema,
  // type-specific config
  select_options: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })).optional(),
  multi_select_options: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })).optional(),
  relation: z.object({ database_id: z.string().uuid(), type: z.enum(['single', 'dual']), synced_property_id: z.string().optional() }).optional(),
  rollup: z.object({ relation_property_id: z.string(), rollup_property_id: z.string(), function: z.string() }).optional(),
  formula: z.object({ expression: z.string() }).optional(),
  status_options: z.array(z.object({ id: z.string(), name: z.string(), color: z.string(), group: z.string() })).optional(),
  number_format: z.enum(['number', 'number_with_commas', 'percent', 'dollar', 'euro', 'pound', 'yen', 'rupee', 'won', 'yuan']).optional(),
})

export type DatabaseProperty = z.infer<typeof DatabasePropertySchema>

export const DatabaseSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  parent_page_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  title: z.array(RichTextSchema),
  description: z.array(RichTextSchema),
  properties: z.record(DatabasePropertySchema),
  default_view_id: z.string().optional(),
  views: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['table', 'board', 'list', 'calendar', 'gallery', 'timeline']),
    filter: z.unknown().optional(),
    sorts: z.array(z.object({ property: z.string(), direction: z.enum(['asc', 'desc']) })).optional(),
    group_by: z.object({ property: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  })).default([]),
})

export type Database = z.infer<typeof DatabaseSchema>

// ============================================
// Workspace & User
// ============================================

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  owner_id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  plan: z.enum(['free', 'personal', 'team', 'enterprise']).default('free'),
  settings: z.object({
    allow_public_pages: z.boolean().default(true),
    allow_guests: z.boolean().default(true),
  }).default({}),
})

export type Workspace = z.infer<typeof WorkspaceSchema>

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  workspaces: z.array(z.string().uuid()).default([]),
})

export type User = z.infer<typeof UserSchema>

// ============================================
// API Request/Response Schemas
// ============================================

export const CreateBlockInputSchema = BlockSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  version: true,
})

export type CreateBlockInput = z.infer<typeof CreateBlockInputSchema>

export const UpdateBlockInputSchema = BlockSchema.partial().required({ id: true, version: true }).omit({
  created_at: true,
  created_by: true,
  workspace_id: true,
})

export type UpdateBlockInput = z.infer<typeof UpdateBlockInputSchema>

export const CreatePageInputSchema = PageSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})

export type CreatePageInput = z.infer<typeof CreatePageInputSchema>

export const QueryDatabaseInputSchema = z.object({
  database_id: z.string().uuid(),
  filter: z.unknown().optional(),
  sorts: z.array(z.object({ property: z.string(), direction: z.enum(['asc', 'desc']) })).optional(),
  page_size: z.number().int().min(1).max(100).default(50),
  start_cursor: z.string().optional(),
})

export type QueryDatabaseInput = z.infer<typeof QueryDatabaseInputSchema>

export const DatabaseRowSchema = z.object({
  id: z.string().uuid(),
  database_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  properties: z.record(z.unknown()),
})

export type DatabaseRow = z.infer<typeof DatabaseRowSchema>

// ============================================
// Realtime / Presence
// ============================================

export const PresenceSchema = z.object({
  user_id: z.string().uuid(),
  user_name: z.string(),
  user_avatar: z.string().nullable(),
  cursor: z.object({ x: z.number(), y: z.number() }).optional(),
  selection: z.array(z.string().uuid()).optional(), // block ids
  last_active: z.string().datetime(),
})

export type Presence = z.infer<typeof PresenceSchema>

// ============================================
// Export all
// ============================================

export const schemas = {
  BlockType: BlockTypeSchema,
  Block: BlockSchema,
  BlockContent: BlockContentSchema,
  RichText: RichTextSchema,
  Page: PageSchema,
  Database: DatabaseSchema,
  DatabaseProperty: DatabasePropertySchema,
  DatabaseRow: DatabaseRowSchema,
  Workspace: WorkspaceSchema,
  User: UserSchema,
  Presence: PresenceSchema,
  CreateBlockInput: CreateBlockInputSchema,
  UpdateBlockInput: UpdateBlockInputSchema,
  CreatePageInput: CreatePageInputSchema,
  QueryDatabaseInput: QueryDatabaseInputSchema,
}