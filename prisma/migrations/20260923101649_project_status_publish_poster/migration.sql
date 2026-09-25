-- AlterTable
ALTER TABLE "Project" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "youtubeUrl" TEXT;

-- AlterTable
ALTER TABLE "RenderJob" ADD COLUMN "posterFileName" TEXT;

-- Project.status is now derived from content (see deriveProjectStatus).
-- The old three-value enum has no direct equivalent for "in_progress", so it
-- is reset to the safe starting point; `npm run db:repair-pipeline` recomputes
-- every project's real status from what it actually contains.
UPDATE "Project" SET "status" = 'draft' WHERE "status" = 'in_progress';
