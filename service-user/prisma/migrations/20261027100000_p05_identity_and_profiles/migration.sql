-- Migration: 20261027100000_p05_identity_and_profiles
-- Forward-only migration to establish persistent profiles, onboarding, and durable account data controls.
-- Preserves existing user and profile records; safely drops placeholder passwordHash.

-- Create RemoteEligibility Enum
DO $$ BEGIN
    CREATE TYPE "RemoteEligibility" AS ENUM ('FULLY_REMOTE', 'HYBRID', 'ON_SITE', 'UNSPECIFIED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Alter User Table: drop placeholder passwordHash, add emailVerified
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Create Index on User role
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- Alter Profile Table: add persistent candidate attributes and preferences
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Profile" ALTER COLUMN "extractedSkills" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "locations" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "remotePreference" "RemoteEligibility" NOT NULL DEFAULT 'UNSPECIFIED';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "minSalary" DOUBLE PRECISION;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'BDT';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create Index on Profile userId
CREATE INDEX IF NOT EXISTS "Profile_userId_idx" ON "Profile"("userId");

-- Create AccountDeletionRequest Table for durable deletion requests (30-day grace period)
CREATE TABLE IF NOT EXISTS "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "reason" TEXT,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- Unique index on idempotencyKey
CREATE UNIQUE INDEX IF NOT EXISTS "AccountDeletionRequest_idempotencyKey_key" ON "AccountDeletionRequest"("idempotencyKey");

-- Index on AccountDeletionRequest
CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_userId_status_idx" ON "AccountDeletionRequest"("userId", "status");

-- Foreign key for AccountDeletionRequest
ALTER TABLE "AccountDeletionRequest" DROP CONSTRAINT IF EXISTS "AccountDeletionRequest_userId_fkey";
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create AccountExportRequest Table for durable export requests
CREATE TABLE IF NOT EXISTS "AccountExportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "format" TEXT NOT NULL DEFAULT 'JSON',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "archiveUrl" TEXT,

    CONSTRAINT "AccountExportRequest_pkey" PRIMARY KEY ("id")
);

-- Index on AccountExportRequest
CREATE INDEX IF NOT EXISTS "AccountExportRequest_userId_status_idx" ON "AccountExportRequest"("userId", "status");

-- Foreign key for AccountExportRequest
ALTER TABLE "AccountExportRequest" DROP CONSTRAINT IF EXISTS "AccountExportRequest_userId_fkey";
ALTER TABLE "AccountExportRequest" ADD CONSTRAINT "AccountExportRequest_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
