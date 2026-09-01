import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const applicationProgress = sqliteTable('application_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  jobKey: text('job_key').notNull(),
  status: text('status').notNull().default('关注'),
  note: text('note').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('progress_user_job_idx').on(table.userId, table.jobKey)]);

export const searchRequests = sqliteTable('search_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  brief: text('brief').notNull(),
  status: text('status').notNull().default('待处理'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
