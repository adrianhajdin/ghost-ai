-- Purge legacy design-agent task history before removing the enum value.
-- The route and worker handler are removed in the same change, so no new rows can be created.
DELETE FROM "AiTaskAttempt"
WHERE "taskRunId" IN (
  SELECT id FROM "AiTaskRun" WHERE "type" = 'design_agent'::"AiTaskType"
);

DELETE FROM "AiTaskEvent"
WHERE "taskRunId" IN (
  SELECT id FROM "AiTaskRun" WHERE "type" = 'design_agent'::"AiTaskType"
);

DELETE FROM "AiTaskRun"
WHERE "type" = 'design_agent'::"AiTaskType";

CREATE TYPE "AiTaskType_new" AS ENUM (
  'generate_spec',
  'architecture_draft',
  'prompt_pack'
);

ALTER TABLE "AiTaskRun"
ALTER COLUMN "type" TYPE "AiTaskType_new"
USING ("type"::text::"AiTaskType_new");

DROP TYPE "AiTaskType";

ALTER TYPE "AiTaskType_new" RENAME TO "AiTaskType";
