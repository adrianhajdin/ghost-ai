ALTER TYPE "AiTaskType" ADD VALUE IF NOT EXISTS 'architect_conversation';

CREATE TYPE "ArchitectConversationRole" AS ENUM ('user', 'assistant');

CREATE TABLE "ArchitectConversationMessage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "graphId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ArchitectConversationRole" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "linkedRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArchitectConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArchitectConversationMessage_projectId_graphId_createdAt_idx"
  ON "ArchitectConversationMessage"("projectId", "graphId", "createdAt");

CREATE INDEX "ArchitectConversationMessage_userId_idx"
  ON "ArchitectConversationMessage"("userId");

CREATE INDEX "ArchitectConversationMessage_linkedRunId_idx"
  ON "ArchitectConversationMessage"("linkedRunId");

ALTER TABLE "ArchitectConversationMessage"
  ADD CONSTRAINT "ArchitectConversationMessage_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchitectConversationMessage"
  ADD CONSTRAINT "ArchitectConversationMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
