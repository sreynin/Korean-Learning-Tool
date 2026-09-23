-- CreateTable
CREATE TABLE "Metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hashtags" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "thumbnailText" TEXT NOT NULL,
    "pinnedComment" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL,
    "model" TEXT NOT NULL,
    "editedAt" DATETIME,
    CONSTRAINT "Metadata_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Metadata_projectId_format_key" ON "Metadata"("projectId", "format");
