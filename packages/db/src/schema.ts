import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import type { BlockType, RichText } from '@notion-base/shared'

// ============================================
// Users & Workspaces
// ============================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatar_url: text('avatar_url'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon'),
  owner_id: uuid('owner_id').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  plan: text('plan', { enum: ['free', 'personal', 'team', 'enterprise'] }).notNull().default('free'),
  settings: jsonb('settings').notNull().default({ allow_public_pages: true, allow_guests: true }),
})

export const workspaceMembers = pgTable('workspace_members', {
  workspace_id: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'member', 'guest'] }).notNull().default('member'),
  joined_at: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.workspace_id, t.user_id] }),
}))

// ============================================
// Pages
// ============================================

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspace_id: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  parent_id: uuid('parent_id').references(() => pages.id, { onDelete: 'set null' }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  title: jsonb('title').$type<RichText[]>().notNull().default([]),
  icon: jsonb('icon').$type<{ emoji: string } | null>(),
  cover: jsonb('cover').$type<{ url: string } | null>(),
  properties: jsonb('properties'),
  is_archived: boolean('is_archived').notNull().default(false),
  is_published: boolean('is_published').notNull().default(false),
  public_url: text('public_url'),
  slug: text('slug'),
}, (t) => ({
  workspaceIdx: index('pages_workspace_idx').on(t.workspace_id),
  parentIdx: index('pages_parent_idx').on(t.parent_id),
  createdByIdx: index('pages_created_by_idx').on(t.created_by),
  slugIdx: uniqueIndex('pages_slug_unique').on(t.slug),
}))

// ============================================
// Blocks
// ============================================

export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type', { enum: [
    'paragraph', 'heading1', 'heading2', 'heading3',
    'bulleted_list', 'numbered_list', 'todo',
    'image', 'video', 'file', 'pdf', 'bookmark', 'embed',
    'column', 'column_list', 'divider', 'callout', 'quote', 'code',
    'table', 'table_row', 'database', 'database_view',
    'synced_block', 'link_preview', 'breadcrumb', 'table_of_contents', 'equation',
  ] }).notNull(),
  parent_id: uuid('parent_id').notNull(), // page_id or block_id
  workspace_id: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(0),
  content: jsonb('content').notNull(),
  properties: jsonb('properties'),
  index: integer('index').notNull().default(0),
  has_children: boolean('has_children').notNull().default(false),
}, (t) => ({
  workspaceIdx: index('blocks_workspace_idx').on(t.workspace_id),
  parentIdx: index('blocks_parent_idx').on(t.parent_id),
  createdByIdx: index('blocks_created_by_idx').on(t.created_by),
  parentIndexIdx: index('blocks_parent_index_idx').on(t.parent_id, t.index),
}))

// ============================================
// Databases
// ============================================

export const databases = pgTable('databases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspace_id: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  parent_page_id: uuid('parent_page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  title: jsonb('title').$type<RichText[]>().notNull().default([]),
  description: jsonb('description').$type<RichText[]>().notNull().default([]),
  properties: jsonb('properties').notNull(), // Record<string, DatabaseProperty>
  default_view_id: text('default_view_id'),
  views: jsonb('views').notNull().default([]),
}, (t) => ({
  workspaceIdx: index('databases_workspace_idx').on(t.workspace_id),
  parentPageIdx: index('databases_parent_page_idx').on(t.parent_page_id),
}))

// ============================================
// Database Rows (entries)
// ============================================

export const databaseRows = pgTable('database_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  database_id: uuid('database_id').notNull().references(() => databases.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  properties: jsonb('properties').notNull(), // property_id -> value
}, (t) => ({
  databaseIdx: index('database_rows_database_idx').on(t.database_id),
  createdByIdx: index('database_rows_created_by_idx').on(t.created_by),
}))

// ============================================
// Files / Assets
// ============================================

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspace_id: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  uploaded_by: uuid('uploaded_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  filename: text('filename').notNull(),
  mime_type: text('mime_type').notNull(),
  size: integer('size').notNull(),
  url: text('url').notNull(), // S3/R2 signed URL or CDN
  metadata: jsonb('metadata'),
})

// ============================================
// Comments
// ============================================

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspace_id: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  block_id: uuid('block_id').references(() => blocks.id, { onDelete: 'cascade' }),
  page_id: uuid('page_id').references(() => pages.id, { onDelete: 'cascade' }),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  content: jsonb('content').notNull(), // RichText[]
  resolved: boolean('resolved').notNull().default(false),
  parent_comment_id: uuid('parent_comment_id').references(() => comments.id, { onDelete: 'cascade' }),
}, (t) => ({
  blockIdx: index('comments_block_idx').on(t.block_id),
  pageIdx: index('comments_page_idx').on(t.page_id),
}))

// ============================================
// Relations
// ============================================

export const usersRelations = relations(users, ({ many }) => ({
  ownedWorkspaces: many(workspaces),
  memberships: many(workspaceMembers),
  createdPages: many(pages),
  createdBlocks: many(blocks),
  createdDatabases: many(databases),
  createdRows: many(databaseRows),
  uploadedFiles: many(files),
  comments: many(comments),
}))

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.owner_id], references: [users.id] }),
  members: many(workspaceMembers),
  pages: many(pages),
  blocks: many(blocks),
  databases: many(databases),
  files: many(files),
  comments: many(comments),
}))

export const pagesRelations = relations(pages, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [pages.workspace_id], references: [workspaces.id] }),
  parent: one(pages, { fields: [pages.parent_id], references: [pages.id], relationName: 'pageHierarchy' }),
  children: many(pages, { relationName: 'pageHierarchy' }),
  createdBy: one(users, { fields: [pages.created_by], references: [users.id] }),
  blocks: many(blocks),
  databases: many(databases),
  comments: many(comments),
}))

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [blocks.workspace_id], references: [workspaces.id] }),
  createdBy: one(users, { fields: [blocks.created_by], references: [users.id] }),
  parentPage: one(pages, { fields: [blocks.parent_id], references: [pages.id] }),
  parentBlock: one(blocks, { fields: [blocks.parent_id], references: [blocks.id], relationName: 'blockHierarchy' }),
  children: many(blocks, { relationName: 'blockHierarchy' }),
  comments: many(comments),
}))

export const databasesRelations = relations(databases, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [databases.workspace_id], references: [workspaces.id] }),
  parentPage: one(pages, { fields: [databases.parent_page_id], references: [pages.id] }),
  createdBy: one(users, { fields: [databases.created_by], references: [users.id] }),
  rows: many(databaseRows),
}))

export const databaseRowsRelations = relations(databaseRows, ({ one }) => ({
  database: one(databases, { fields: [databaseRows.database_id], references: [databases.id] }),
  createdBy: one(users, { fields: [databaseRows.created_by], references: [users.id] }),
}))

export const filesRelations = relations(files, ({ one }) => ({
  workspace: one(workspaces, { fields: [files.workspace_id], references: [workspaces.id] }),
  uploadedBy: one(users, { fields: [files.uploaded_by], references: [users.id] }),
}))

export const commentsRelations = relations(comments, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [comments.workspace_id], references: [workspaces.id] }),
  block: one(blocks, { fields: [comments.block_id], references: [blocks.id] }),
  page: one(pages, { fields: [comments.page_id], references: [pages.id] }),
  createdBy: one(users, { fields: [comments.created_by], references: [users.id] }),
  parent: one(comments, { fields: [comments.parent_comment_id], references: [comments.id], relationName: 'commentThread' }),
  replies: many(comments, { relationName: 'commentThread' }),
}))

// ============================================
// Types
// ============================================

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Workspace = typeof workspaces.$inferSelect
export type NewWorkspace = typeof workspaces.$inferInsert

export type WorkspaceMember = typeof workspaceMembers.$inferSelect

export type Page = typeof pages.$inferSelect
export type NewPage = typeof pages.$inferInsert

export type Block = typeof blocks.$inferSelect
export type NewBlock = typeof blocks.$inferInsert

export type Database = typeof databases.$inferSelect
export type NewDatabase = typeof databases.$inferInsert

export type DatabaseRow = typeof databaseRows.$inferSelect
export type NewDatabaseRow = typeof databaseRows.$inferInsert

export type File = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert

export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert