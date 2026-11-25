import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const workspaceItems = pgTable('workspace_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  prompt: text('prompt'),
  model: text('model'),
  content: text('content'),
  mediaUrl: text('media_url'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const gameScores = pgTable('game_scores', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  score: integer('score').notNull(),
  wave: integer('wave').notNull(),
  orbsCollected: integer('orbs_collected').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const savedPlaces = pgTable('saved_places', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  placeId: text('place_id').notNull(),
  name: text('name').notNull(),
  address: text('address'),
  lat: text('lat').notNull(),
  lng: text('lng').notNull(),
  category: text('category'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  workspaceItems: many(workspaceItems),
  gameScores: many(gameScores),
  savedPlaces: many(savedPlaces),
}));

export const workspaceItemsRelations = relations(workspaceItems, ({ one }) => ({
  author: one(users, {
    fields: [workspaceItems.userId],
    references: [users.id],
  }),
}));

export const gameScoresRelations = relations(gameScores, ({ one }) => ({
  player: one(users, {
    fields: [gameScores.userId],
    references: [users.id],
  }),
}));

export const savedPlacesRelations = relations(savedPlaces, ({ one }) => ({
  owner: one(users, {
    fields: [savedPlaces.userId],
    references: [users.id],
  }),
}));
