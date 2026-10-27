-- Migration: 20261027180000_p05_scoped_deletion_idempotency
-- Forward-only migration: scopes AccountDeletionRequest idempotencyKey uniqueness to userId.
-- Replaces global unique constraint on idempotencyKey with composite unique constraint (userId, idempotencyKey).
-- Preserves all existing requests and ensures foreign requests are never disclosed across candidates.

-- 1. Drop existing global unique index on idempotencyKey
DROP INDEX IF EXISTS "AccountDeletionRequest_idempotencyKey_key";

-- 2. Create composite unique index on (userId, idempotencyKey)
CREATE UNIQUE INDEX IF NOT EXISTS "AccountDeletionRequest_userId_idempotencyKey_key" 
ON "AccountDeletionRequest"("userId", "idempotencyKey");
