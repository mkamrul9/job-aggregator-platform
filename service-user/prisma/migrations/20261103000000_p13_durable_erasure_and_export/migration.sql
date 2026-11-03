-- Alter AccountDeletionRequest to add lease and attempt tracking
ALTER TABLE "AccountDeletionRequest" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "AccountDeletionRequest" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;

-- Alter AccountExportRequest to default status to PENDING and add checksum/size
ALTER TABLE "AccountExportRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "AccountExportRequest" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;
ALTER TABLE "AccountExportRequest" ADD COLUMN IF NOT EXISTS "checksum" TEXT;

-- Create DurableErasureRecord Table to prevent stale resurrecting of erased accounts
CREATE TABLE IF NOT EXISTS "DurableErasureRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "erasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "purgedKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "DurableErasureRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DurableErasureRecord_userId_key" ON "DurableErasureRecord"("userId");
CREATE INDEX IF NOT EXISTS "DurableErasureRecord_userId_idx" ON "DurableErasureRecord"("userId");
