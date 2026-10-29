-- CreateTable: SavedJob
CREATE TABLE IF NOT EXISTS "SavedJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "companySnapshot" TEXT NOT NULL,
    "locationSnapshot" TEXT,
    "jobUrlSnapshot" TEXT,
    "salarySnapshot" TEXT,
    "sourceSnapshot" TEXT,
    "statusAtSave" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SavedSearch
CREATE TABLE IF NOT EXISTS "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT,
    "location" TEXT,
    "remoteEligibility" TEXT,
    "seniority" TEXT,
    "jobType" TEXT,
    "minSalary" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "payPeriod" TEXT NOT NULL DEFAULT 'MONTHLY',
    "sort" TEXT NOT NULL DEFAULT 'date_desc',
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alertFrequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TrackedApplication
CREATE TABLE IF NOT EXISTS "TrackedApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "companySnapshot" TEXT NOT NULL,
    "locationSnapshot" TEXT,
    "jobUrlSnapshot" TEXT,
    "salarySnapshot" TEXT,
    "sourceSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ApplicationHistory
CREATE TABLE IF NOT EXISTS "ApplicationHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "notesSnapshot" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SupportReport
CREATE TABLE IF NOT EXISTS "SupportReport" (
    "id" TEXT NOT NULL,
    "referenceNum" TEXT NOT NULL,
    "userId" TEXT,
    "jobId" TEXT,
    "reportType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contactEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "operatorNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AlertSubscription
CREATE TABLE IF NOT EXISTS "AlertSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "location" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex: SavedJob(userId, jobId)
CREATE UNIQUE INDEX IF NOT EXISTS "SavedJob_userId_jobId_key" ON "SavedJob"("userId", "jobId");
CREATE INDEX IF NOT EXISTS "SavedJob_userId_createdAt_idx" ON "SavedJob"("userId", "createdAt");

-- CreateIndex: SavedSearch
CREATE INDEX IF NOT EXISTS "SavedSearch_userId_createdAt_idx" ON "SavedSearch"("userId", "createdAt");

-- CreateUniqueIndex: TrackedApplication(userId, jobId)
CREATE UNIQUE INDEX IF NOT EXISTS "TrackedApplication_userId_jobId_key" ON "TrackedApplication"("userId", "jobId");
CREATE INDEX IF NOT EXISTS "TrackedApplication_userId_status_idx" ON "TrackedApplication"("userId", "status");
CREATE INDEX IF NOT EXISTS "TrackedApplication_userId_updatedAt_idx" ON "TrackedApplication"("userId", "updatedAt");

-- CreateIndex: ApplicationHistory
CREATE INDEX IF NOT EXISTS "ApplicationHistory_applicationId_changedAt_idx" ON "ApplicationHistory"("applicationId", "changedAt");
CREATE INDEX IF NOT EXISTS "ApplicationHistory_userId_idx" ON "ApplicationHistory"("userId");

-- CreateUniqueIndex: SupportReport(referenceNum)
CREATE UNIQUE INDEX IF NOT EXISTS "SupportReport_referenceNum_key" ON "SupportReport"("referenceNum");
CREATE INDEX IF NOT EXISTS "SupportReport_userId_createdAt_idx" ON "SupportReport"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportReport_status_createdAt_idx" ON "SupportReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportReport_referenceNum_idx" ON "SupportReport"("referenceNum");

-- CreateIndex: AlertSubscription
CREATE INDEX IF NOT EXISTS "AlertSubscription_userId_active_idx" ON "AlertSubscription"("userId", "active");

-- AddForeignKey: SavedJob
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SavedJob_userId_fkey'
    ) THEN
        ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: SavedSearch
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SavedSearch_userId_fkey'
    ) THEN
        ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: TrackedApplication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TrackedApplication_userId_fkey'
    ) THEN
        ALTER TABLE "TrackedApplication" ADD CONSTRAINT "TrackedApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: ApplicationHistory
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ApplicationHistory_applicationId_fkey'
    ) THEN
        ALTER TABLE "ApplicationHistory" ADD CONSTRAINT "ApplicationHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TrackedApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: SupportReport
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SupportReport_userId_fkey'
    ) THEN
        ALTER TABLE "SupportReport" ADD CONSTRAINT "SupportReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: AlertSubscription
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AlertSubscription_userId_fkey'
    ) THEN
        ALTER TABLE "AlertSubscription" ADD CONSTRAINT "AlertSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

