import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `doc_${Date.now()}`;
}

export async function ensureFirestoreUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  voice: string;
  auraMood: string;
}) {
  const safeUid = sanitizeFirestoreId(params.uid);
  const path = `users/${safeUid}`;
  const ref = doc(db, 'users', safeUid);
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        uid: params.uid,
        email: (params.email || 'user@example.com').slice(0, 320),
        displayName: (params.displayName || 'Tojuu Explorer').slice(0, 120),
        voice: (params.voice || 'Aoede').slice(0, 40),
        auraMood: (params.auraMood || 'cyberpunk').slice(0, 40),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: (params.displayName || 'Tojuu Explorer').slice(0, 120),
        voice: (params.voice || 'Aoede').slice(0, 40),
        auraMood: (params.auraMood || 'cyberpunk').slice(0, 40),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncCreationToFirestore(params: {
  uid: string;
  creationId: string;
  kind: 'chat_note' | 'image' | 'music' | 'transcript' | 'place' | 'game_score';
  title: string;
  summary: string;
  model: string;
}) {
  const safeUid = sanitizeFirestoreId(params.uid);
  const safeCreationId = sanitizeFirestoreId(params.creationId);
  const path = `users/${safeUid}/creations/${safeCreationId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'creations', safeCreationId), {
      userId: params.uid,
      kind: params.kind,
      title: params.title.slice(0, 200) || 'Untitled',
      summary: params.summary.slice(0, 4000),
      model: params.model.slice(0, 100) || 'gemini-4-hydrogen',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchFirestoreCreations(uid: string) {
  const safeUid = sanitizeFirestoreId(uid);
  const path = `users/${safeUid}/creations`;
  try {
    const q = query(
      collection(db, 'users', safeUid, 'creations'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function syncMemoryToFirestore(params: {
  uid: string;
  memoryId: string;
  type: string;
  content: string;
  confidence: number;
  importance: number;
  active: boolean;
  source: string;
}) {
  const safeUid = sanitizeFirestoreId(params.uid);
  const safeMemId = sanitizeFirestoreId(params.memoryId);
  const path = `users/${safeUid}/memories/${safeMemId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'memories', safeMemId), {
      userId: params.uid,
      type: params.type.slice(0, 40) || 'fact',
      content: params.content.slice(0, 2000),
      confidence: Math.min(1, Math.max(0, Number(params.confidence) || 0.9)),
      importance: Math.min(1, Math.max(0, Number(params.importance) || 0.7)),
      active: Boolean(params.active),
      source: params.source.slice(0, 80) || 'conversation',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFirestoreMemory(uid: string, memoryId: string) {
  const safeUid = sanitizeFirestoreId(uid);
  const safeMemId = sanitizeFirestoreId(memoryId);
  const path = `users/${safeUid}/memories/${safeMemId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'memories', safeMemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
