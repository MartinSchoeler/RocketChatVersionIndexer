import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const versions = sqliteTable('versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tag: text('tag').notNull().unique(),
  major: integer('major').notNull(),
  minor: integer('minor').notNull(),
  patch: integer('patch').notNull(),
  status: text('status', { enum: ['pending', 'indexing', 'complete', 'failed'] }).notNull().default('pending'),
  endpointCount: integer('endpoint_count').default(0),
  indexedAt: text('indexed_at'),
});

export const endpoints = sqliteTable('endpoints', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  versionId: integer('version_id').notNull().references(() => versions.id),
  path: text('path').notNull(),
  method: text('method').notNull(),
  paramType: text('param_type'),
  returnType: text('return_type'),
  typeBlock: text('type_block'),
  implCode: text('impl_code'),
  implConfig: text('impl_config'),
  typeFile: text('type_file'),
  implFile: text('impl_file'),
  implStartLine: integer('impl_start_line'),
  implEndLine: integer('impl_end_line'),
}, (table) => [
  uniqueIndex('endpoints_version_path_method').on(table.versionId, table.path, table.method),
  index('endpoints_path_method').on(table.path, table.method),
]);

export const indexingLog = sqliteTable('indexing_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  versionId: integer('version_id').notNull().references(() => versions.id),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  status: text('status', { enum: ['running', 'success', 'error'] }).notNull(),
  errorMsg: text('error_msg'),
  endpointsFound: integer('endpoints_found').default(0),
});
