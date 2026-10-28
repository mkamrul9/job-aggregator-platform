-- Migration: 20261028000000_p08_resume_documents_and_lifecycle
-- Forward-only migration to establish persistent owned resume documents, asynchronous parse results, and worker lifecycle.

-- Create ResumeDocument Table
CREATE TABLE IF NOT EXISTS "ResumeDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResumeDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ResumeDocument_userId_status_idx" ON "ResumeDocument"("userId", "status");
CREATE INDEX IF NOT EXISTS "ResumeDocument_storageKey_idx" ON "ResumeDocument"("storageKey");

-- Create ResumeParseResult Table
CREATE TABLE IF NOT EXISTS "ResumeParseResult" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "extractedSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewedSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "processingTimeMs" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "claimedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeParseResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResumeParseResult_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ResumeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResumeParseResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ResumeParseResult_userId_status_idx" ON "ResumeParseResult"("userId", "status");
CREATE INDEX IF NOT EXISTS "ResumeParseResult_documentId_idx" ON "ResumeParseResult"("documentId");
