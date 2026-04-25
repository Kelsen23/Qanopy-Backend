-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "upvote" BOOLEAN NOT NULL DEFAULT true,
    "downvote" BOOLEAN NOT NULL DEFAULT true,
    "answerCreated" BOOLEAN NOT NULL DEFAULT true,
    "replyCreated" BOOLEAN NOT NULL DEFAULT true,
    "aiSuggestionUnlocked" BOOLEAN NOT NULL DEFAULT true,
    "aiAnswerUnlocked" BOOLEAN NOT NULL DEFAULT true,
    "similarQuestionsReady" BOOLEAN NOT NULL DEFAULT true,
    "warn" BOOLEAN NOT NULL DEFAULT true,
    "strike" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
