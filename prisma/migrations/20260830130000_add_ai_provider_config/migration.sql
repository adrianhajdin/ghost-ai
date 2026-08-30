-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('OLLAMA', 'LMSTUDIO', 'OPENAI', 'ANTHROPIC', 'OPENROUTER', 'CUSTOM');

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "AiProviderType" NOT NULL,
    "model" TEXT NOT NULL,
    "baseUrl" TEXT,
    "encryptedApiKey" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiProviderConfig_projectId_idx" ON "AiProviderConfig"("projectId");

-- CreateIndex
CREATE INDEX "AiProviderConfig_projectId_isDefault_idx" ON "AiProviderConfig"("projectId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_projectId_name_key" ON "AiProviderConfig"("projectId", "name");

-- AddForeignKey
ALTER TABLE "AiProviderConfig" ADD CONSTRAINT "AiProviderConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
