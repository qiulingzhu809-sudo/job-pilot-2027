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

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  company: text('company').notNull(),
  role: text('role').notNull(),
  companyType: text('company_type').notNull(),
  industry: text('industry').notNull(),
  baseJson: text('base_json').notNull(),
  track: text('track').notNull(),
  tagsJson: text('tags_json').notNull(),
  batch: text('batch').notNull(),
  graduationYear: integer('graduation_year').notNull(),
  officialUrl: text('official_url').notNull(),
  applyStatus: text('apply_status').notNull(),
  remoteInterview: text('remote_interview').notNull(),
  verifiedAt: text('verified_at').notNull(),
  duplicateCheck: text('duplicate_check').notNull(),
  score: integer('score_tenths').notNull(),
  scoreReason: text('score_reason').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('jobs_user_official_url_idx').on(table.userId, table.officialUrl)]);
