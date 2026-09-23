-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "contentStyle" TEXT NOT NULL,
    "visualStyle" TEXT NOT NULL,
    "shortsDurationSeconds" INTEGER,
    "longDurationSeconds" INTEGER,
    "pipeline" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "learningObjective" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sections" TEXT NOT NULL,
    "quiz" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL,
    "model" TEXT NOT NULL,
    "editedAt" DATETIME,
    CONSTRAINT "Lesson_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Storyboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL,
    "model" TEXT NOT NULL,
    "editedAt" DATETIME,
    CONSTRAINT "Storyboard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyboardId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "koreanText" TEXT NOT NULL,
    "englishText" TEXT NOT NULL,
    "romanization" TEXT NOT NULL,
    "narration" TEXT NOT NULL,
    "visualPrompt" TEXT NOT NULL,
    "animation" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "transition" TEXT NOT NULL,
    CONSTRAINT "Scene_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "Storyboard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_format_idx" ON "Project"("format");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_projectId_key" ON "Lesson"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Storyboard_projectId_key" ON "Storyboard"("projectId");

-- CreateIndex
CREATE INDEX "Scene_storyboardId_idx" ON "Scene"("storyboardId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_storyboardId_order_key" ON "Scene"("storyboardId", "order");
