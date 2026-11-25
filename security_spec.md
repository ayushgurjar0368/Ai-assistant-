# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. Every `/users/{userId}` document belongs exclusively to `request.auth.uid == userId` and contains immutable `uid` and `createdAt`.
2. Users cannot list `/users` (prevents PII enumeration of user emails).
3. Every subcollection document under `/users/{userId}/memories/{memoryId}` and `/users/{userId}/creations/{creationId}` requires an existing parent `/users/{userId}` document whose `uid == request.auth.uid` on write operations.
4. All writes require `request.auth != null` and `request.auth.token.email_verified == true`.
5. All document IDs (`userId`, `memoryId`, `creationId`) must pass `isValidId()` (`^[a-zA-Z0-9_\-]+$`, length 1..128).
6. All `createdAt` and `updatedAt` timestamps must equal `request.time` on creation, and `updatedAt == request.time` with immutable `createdAt` on update.
7. List queries on subcollections enforce `resource.data.userId == request.auth.uid` without calling `get()` or `exists()`.

## 2. The "Dirty Dozen" Payloads (All Must Yield `PERMISSION_DENIED`)
1. **Unauthenticated read on `/users/userA`**: `auth = null` -> DENIED.
2. **Cross-user profile read on `/users/userA`**: `auth = { uid: 'userB', email_verified: true }` -> DENIED.
3. **Directory listing on `/users`**: `list /users` as authenticated user -> DENIED.
4. **Unverified email write on `/users/userA`**: `auth = { uid: 'userA', email_verified: false }` -> DENIED.
5. **Ghost/shadow field injection (`isAdmin: true`) on `/users/userA` create** -> DENIED (`hasOnly` rejects).
6. **Client-forged `createdAt` timestamp** (`createdAt: new Date(0)`) on `/users/userA` create -> DENIED (`createdAt == request.time` fails).
7. **ID poisoning (`../evil` or 500-char doc ID)** on `/users/userA/memories/{badId}` -> DENIED (`isValidId` fails).
8. **Cross-tenant UID spoofing** (`userId: 'userA'` inside `/users/userB/memories/m1` written by `userB`) -> DENIED.
9. **Orphaned subcollection write** (`/users/userA/memories/m1` before `/users/userA` exists) -> DENIED (`exists` Master Gate fails).
10. **Immutable field mutation** (changing `uid` or `createdAt` on `/users/userA` update) -> DENIED.
11. **Oversized content payload** (`content` string > 2000 chars on `/users/userA/memories/m1`) -> DENIED.
12. **Out-of-range confidence or invalid creation kind** (`kind: 'arbitrary_exec'` on `/users/userA/creations/c1`) -> DENIED.
