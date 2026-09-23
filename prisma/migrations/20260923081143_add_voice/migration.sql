-- DropIndex
DROP INDEX "Scene_storyboardId_order_key";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "voiceSettings" TEXT;

-- CreateTable
CREATE TABLE "SceneAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "durationSeconds" REAL NOT NULL,
    "language" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "voiceName" TEXT NOT NULL,
    "speed" REAL NOT NULL,
    "pitch" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "provider" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL,
    CONSTRAINT "SceneAudio_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SceneAudio_sceneId_key" ON "SceneAudio"("sceneId");

-- CreateIndex
CREATE INDEX "Scene_storyboardId_order_idx" ON "Scene"("storyboardId", "order");
