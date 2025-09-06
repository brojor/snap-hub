import { pgTable, varchar, integer, timestamp, boolean, index, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';

export const oneTimeTokens = pgTable('one_time_tokens', {
  tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  used: boolean('used').default(false).notNull(),
}, (table) => ({
  userIdIdx: index('idx_one_time_tokens_user_id').on(table.userId),
  expiresAtIdx: index('idx_one_time_tokens_expires_at').on(table.expiresAt),
  usedIdx: index('idx_one_time_tokens_used').on(table.used),
}));