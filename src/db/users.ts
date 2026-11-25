import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { gameScores, savedPlaces, users, workspaceItems } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  photoUrl?: string | null
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || null,
        photoUrl: photoUrl || null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || null,
          photoUrl: photoUrl || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserWorkspaceItems(uid: string) {
  try {
    return await db
      .select({
        id: workspaceItems.id,
        kind: workspaceItems.kind,
        title: workspaceItems.title,
        prompt: workspaceItems.prompt,
        model: workspaceItems.model,
        content: workspaceItems.content,
        mediaUrl: workspaceItems.mediaUrl,
        metadata: workspaceItems.metadata,
        createdAt: workspaceItems.createdAt,
      })
      .from(workspaceItems)
      .innerJoin(users, eq(workspaceItems.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(workspaceItems.createdAt))
      .limit(40);
  } catch (error) {
    console.error('Database query failed (getUserWorkspaceItems):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createUserWorkspaceItem(
  uid: string,
  email: string,
  payload: {
    kind: string;
    title: string;
    prompt?: string;
    model?: string;
    content?: string;
    mediaUrl?: string;
    metadata?: string;
  }
) {
  try {
    const user = await getOrCreateUser(uid, email);
    const inserted = await db
      .insert(workspaceItems)
      .values({
        userId: user.id,
        kind: payload.kind,
        title: payload.title,
        prompt: payload.prompt || null,
        model: payload.model || null,
        content: payload.content || null,
        mediaUrl: payload.mediaUrl || null,
        metadata: payload.metadata || null,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed (createUserWorkspaceItem):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteUserWorkspaceItem(uid: string, itemId: number) {
  try {
    const user = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (!user[0]) return false;

    const deleted = await db
      .delete(workspaceItems)
      .where(and(eq(workspaceItems.id, itemId), eq(workspaceItems.userId, user[0].id)))
      .returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed (deleteUserWorkspaceItem):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserGameScores(uid: string) {
  try {
    return await db
      .select({
        id: gameScores.id,
        score: gameScores.score,
        wave: gameScores.wave,
        orbsCollected: gameScores.orbsCollected,
        createdAt: gameScores.createdAt,
      })
      .from(gameScores)
      .innerJoin(users, eq(gameScores.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(gameScores.score))
      .limit(10);
  } catch (error) {
    console.error('Database query failed (getUserGameScores):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createUserGameScore(
  uid: string,
  email: string,
  payload: { score: number; wave: number; orbsCollected: number }
) {
  try {
    const user = await getOrCreateUser(uid, email);
    const inserted = await db
      .insert(gameScores)
      .values({
        userId: user.id,
        score: payload.score,
        wave: payload.wave,
        orbsCollected: payload.orbsCollected,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed (createUserGameScore):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserSavedPlaces(uid: string) {
  try {
    return await db
      .select({
        id: savedPlaces.id,
        placeId: savedPlaces.placeId,
        name: savedPlaces.name,
        address: savedPlaces.address,
        lat: savedPlaces.lat,
        lng: savedPlaces.lng,
        category: savedPlaces.category,
        notes: savedPlaces.notes,
        createdAt: savedPlaces.createdAt,
      })
      .from(savedPlaces)
      .innerJoin(users, eq(savedPlaces.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(savedPlaces.createdAt))
      .limit(50);
  } catch (error) {
    console.error('Database query failed (getUserSavedPlaces):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createUserSavedPlace(
  uid: string,
  email: string,
  payload: {
    placeId: string;
    name: string;
    address?: string;
    lat: string;
    lng: string;
    category?: string;
    notes?: string;
  }
) {
  try {
    const user = await getOrCreateUser(uid, email);
    const inserted = await db
      .insert(savedPlaces)
      .values({
        userId: user.id,
        placeId: payload.placeId,
        name: payload.name,
        address: payload.address || null,
        lat: payload.lat,
        lng: payload.lng,
        category: payload.category || null,
        notes: payload.notes || null,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed (createUserSavedPlace):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteUserSavedPlace(uid: string, id: number) {
  try {
    const user = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (!user[0]) return false;

    const deleted = await db
      .delete(savedPlaces)
      .where(and(eq(savedPlaces.id, id), eq(savedPlaces.userId, user[0].id)))
      .returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed (deleteUserSavedPlace):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
