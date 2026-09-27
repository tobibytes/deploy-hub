import { relations, sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['owner', 'member']);
export const appStatus = pgEnum('app_status', ['deploying', 'running', 'stopped', 'failed']);
export const eventAction = pgEnum('event_action', [
  'create',
  'deploy',
  'start',
  'stop',
  'restart',
  'redeploy',
  'env_change',
  'limits_change',
  'delete',
  'reconcile',
]);
export const eventStatus = pgEnum('event_status', ['ok', 'error']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)]);

export const sessions = pgTable('sessions', {
  /** sha256 of the cookie value, so a database leak does not hand out sessions. */
  tokenDigest: text('token_digest').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sessions_user_id_idx').on(t.userId)]);

export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Becomes the subdomain, so it is unique across the whole install. */
  name: text('name').notNull().unique(),
  image: text('image').notNull(),
  internalPort: integer('internal_port').notNull().default(80),
  /** AES-256-GCM blob holding the environment map. */
  envEncrypted: text('env_encrypted').notNull().default(''),
  /** Where a named volume is mounted, or null for an app that keeps nothing. */
  volumePath: text('volume_path'),
  memoryMb: integer('memory_mb').notNull().default(256),
  cpuCores: doublePrecision('cpu_cores').notNull().default(0.5),
  status: appStatus('status').notNull().default('deploying'),
  containerId: text('container_id'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('apps_owner_id_idx').on(t.ownerId)]);

/**
 * Who a data volume belongs to.
 *
 * The volume outlives the app, because deleting an app keeps its data unless
 * asked otherwise. Without this, the next person to use that app name would
 * mount whatever the last one left behind, and app names are public. The claim
 * is kept here rather than as a Docker label because labels cannot be changed
 * after a volume is made.
 */
export const volumeClaims = pgTable('volume_claims', {
  /** The volume itself, rig-<app>-data. */
  name: text('name').primaryKey(),
  /** Null once the account is gone. Only the server owner may take those over. */
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  /** The app that last used it, for the message when a name is refused. */
  appName: text('app_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').references(() => apps.id, { onDelete: 'cascade' }),
  /** Kept for the activity feed even after the app row goes away. */
  appName: text('app_name'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: eventAction('action').notNull(),
  status: eventStatus('status').notNull().default('ok'),
  message: text('message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('events_app_id_idx').on(t.appId), index('events_created_at_idx').on(t.createdAt)]);

export const appsRelations = relations(apps, ({ many, one }) => ({
  events: many(events),
  owner: one(users, { fields: [apps.ownerId], references: [users.id] }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  app: one(apps, { fields: [events.appId], references: [apps.id] }),
}));

export type UserRow = typeof users.$inferSelect;
export type AppRow = typeof apps.$inferSelect;
export type EventRow = typeof events.$inferSelect;
