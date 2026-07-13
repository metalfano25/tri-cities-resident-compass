import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const insightCache = sqliteTable("insight_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const insightLocks = sqliteTable("insight_locks", {
  cacheKey: text("cache_key").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});

export const insightUsage = sqliteTable("insight_usage", {
  day: text("day").primaryKey(),
  calls: integer("calls").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
