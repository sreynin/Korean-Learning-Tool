-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RenderJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'shorts',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "outputFileName" TEXT,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RenderJob" ("completedAt", "createdAt", "errorMessage", "id", "outputFileName", "progress", "projectId", "startedAt", "status") SELECT "completedAt", "createdAt", "errorMessage", "id", "outputFileName", "progress", "projectId", "startedAt", "status" FROM "RenderJob";
DROP TABLE "RenderJob";
ALTER TABLE "new_RenderJob" RENAME TO "RenderJob";
CREATE INDEX "RenderJob_projectId_createdAt_idx" ON "RenderJob"("projectId", "createdAt");
CREATE INDEX "RenderJob_status_idx" ON "RenderJob"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
