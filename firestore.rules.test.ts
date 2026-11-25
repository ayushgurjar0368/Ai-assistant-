/**
 * Phase 0 Verification Suite for Firestore Security Rules ("Dirty Dozen").
 * Designed for @firebase/rules-unit-testing against firestore.rules.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read on user profile',
    operation: 'get',
    path: '/users/userA',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-user PII read on user profile',
    operation: 'get',
    path: '/users/userA',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Blanket list query on /users collection',
    operation: 'list',
    path: '/users',
    auth: { uid: 'userA', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified email write attempt',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email_verified: false },
    payload: {
      uid: 'userA',
      email: 'a@example.com',
      displayName: 'User A',
      voice: 'Aoede',
      auraMood: 'cyberpunk',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field injection (isAdmin: true)',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      email: 'a@example.com',
      displayName: 'User A',
      voice: 'Aoede',
      auraMood: 'cyberpunk',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client-forged createdAt timestamp instead of request.time',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      email: 'a@example.com',
      displayName: 'User A',
      voice: 'Aoede',
      auraMood: 'cyberpunk',
      createdAt: '1970-01-01T00:00:00Z',
      updatedAt: '1970-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Document ID poisoning with invalid characters',
    operation: 'create',
    path: '/users/userA/memories/bad..id$%!',
    auth: { uid: 'userA', email_verified: true },
    payload: { userId: 'userA', type: 'fact', content: 'test' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Cross-tenant userId spoofing in subcollection',
    operation: 'create',
    path: '/users/userB/memories/mem_1',
    auth: { uid: 'userB', email_verified: true },
    payload: {
      userId: 'userA',
      type: 'fact',
      content: 'Spoofed memory',
      confidence: 0.9,
      importance: 0.8,
      active: true,
      source: 'manual',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Orphaned memory write without parent user document',
    operation: 'create',
    path: '/users/userOrphan/memories/mem_1',
    auth: { uid: 'userOrphan', email_verified: true },
    payload: {
      userId: 'userOrphan',
      type: 'fact',
      content: 'Orphan memory',
      confidence: 0.9,
      importance: 0.8,
      active: true,
      source: 'manual',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable uid mutation on profile update',
    operation: 'update',
    path: '/users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userB' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Oversized memory content exceeding 2000 chars',
    operation: 'create',
    path: '/users/userA/memories/mem_big',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      userId: 'userA',
      type: 'fact',
      content: 'x'.repeat(2500),
      confidence: 0.9,
      importance: 0.8,
      active: true,
      source: 'manual',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Invalid creation kind outside allowlist',
    operation: 'create',
    path: '/users/userA/creations/c1',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      userId: 'userA',
      kind: 'arbitrary_exec',
      title: 'Invalid',
      summary: 'Test',
      model: 'gemini-4-hydrogen',
    },
    expected: 'PERMISSION_DENIED',
  },
];
