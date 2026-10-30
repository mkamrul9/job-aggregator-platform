-- CreateTable: RecommendationFeedback
CREATE TABLE IF NOT EXISTS "RecommendationFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecommendationFeedback_userId_jobId_key" ON "RecommendationFeedback"("userId", "jobId");
CREATE INDEX IF NOT EXISTS "RecommendationFeedback_userId_action_idx" ON "RecommendationFeedback"("userId", "action");
CREATE INDEX IF NOT EXISTS "RecommendationFeedback_userId_createdAt_idx" ON "RecommendationFeedback"("userId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RecommendationFeedback_userId_fkey'
    ) THEN
        ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

