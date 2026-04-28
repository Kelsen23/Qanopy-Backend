-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'TERMINATED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Interest" AS ENUM ('JAVASCRIPT', 'PYTHON', 'JAVA', 'C#', 'C++', 'PHP', 'C', 'TYPESCRIPT', 'RUBY', 'SWIFT', 'KOTLIN', 'GO', 'RUST', 'SCALA', 'R', 'PERL', 'HASKELL', 'LUA', 'DART', 'ELIXIR', 'CLOJURE', 'JULIA', 'MATLAB', 'GROOVY', 'POWERSHELL', 'BASH', 'VBSCRIPT', 'ASSEMBLY', 'FORTRAN', 'COBOL', 'HTML', 'CSS', 'ANGULAR', 'REACT', 'VUE.JS', 'JQUERY', 'BOOTSTRAP', 'SVELTE', 'NEXT.JS', 'NUXT.JS', 'WEBPACK', 'SASS', 'LESS', 'TAILWINDCSS', 'EMBER.JS', 'BACKBONE.JS', 'D3.JS', 'THREE.JS', 'NODE.JS', 'EXPRESS', 'DJANGO', 'FLASK', 'SPRING', 'ASP.NET', 'LARAVEL', 'RAILS', 'FASTAPI', 'NESTJS', 'SYMFONY', 'CODEIGNITER', 'PLAY', 'SINATRA', 'SQL', 'MYSQL', 'POSTGRESQL', 'SQLITE', 'MONGODB', 'REDIS', 'ORACLE', 'SQL-SERVER', 'MARIADB', 'CASSANDRA', 'DYNAMODB', 'FIREBASE', 'ELASTICSEARCH', 'NEO4J', 'COUCHDB', 'INFLUXDB', 'ANDROID', 'IOS', 'REACT-NATIVE', 'FLUTTER', 'XAMARIN', 'KOTLIN-MULTIPLATFORM', 'SWIFTUI', 'CORDOVA', 'IONIC', 'AMAZON-WEB-SERVICES', 'AZURE', 'GOOGLE-CLOUD-PLATFORM', 'DOCKER', 'KUBERNETES', 'TERRAFORM', 'ANSIBLE', 'JENKINS', 'CI/CD', 'HEROKU', 'NGINX', 'APACHE', 'LINUX', 'UBUNTU', 'WINDOWS', 'MACHINE-LEARNING', 'TENSORFLOW', 'PYTORCH', 'PANDAS', 'NUMPY', 'SCIKIT-LEARN', 'KERAS', 'OPENCV', 'NLPROC', 'DEEP-LEARNING', 'COMPUTER-VISION', 'DATA-SCIENCE', 'MATPLOTLIB', 'SCIPY', 'JUPYTER-NOTEBOOK', 'GIT', 'GITHUB', 'REGEX', 'JSON', 'XML', 'REST', 'GRAPHQL', 'GRPC', 'WEBSOCKET', 'OAUTH', 'JWT', 'UNIT-TESTING', 'DEBUGGING', 'ALGORITHMS', 'DATA-STRUCTURES', 'DESIGN-PATTERNS', 'MULTITHREADING', 'ASYNC', 'DEPENDENCY-INJECTION');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'GITHUB');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('QUESTION', 'ANSWER', 'REPLY', 'AI_ANSWER_FEEDBACK');

-- CreateEnum
CREATE TYPE "Mods" AS ENUM ('ADMIN_MODERATION', 'AI_MODERATION');

-- CreateEnum
CREATE TYPE "AiDecision" AS ENUM ('BAN_TEMP', 'BAN_PERM', 'WARN', 'IGNORE');

-- CreateEnum
CREATE TYPE "BanType" AS ENUM ('PERM', 'TEMP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "email" VARCHAR(345) NOT NULL,
    "password" VARCHAR(60),
    "profilePictureUrl" TEXT,
    "profilePictureKey" TEXT,
    "bio" VARCHAR(150),
    "reputationPoints" INTEGER NOT NULL DEFAULT 0,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "answersGiven" INTEGER NOT NULL DEFAULT 0,
    "acceptedAnswers" INTEGER NOT NULL DEFAULT 0,
    "bestAnswers" INTEGER NOT NULL DEFAULT 0,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "credits" INTEGER NOT NULL DEFAULT 20,
    "creditsLastRedeemedAt" TIMESTAMP(3),
    "otp" TEXT,
    "otpResendAvailableAt" TIMESTAMP(3),
    "otpExpireAt" TIMESTAMP(3),
    "resetPasswordOtp" TEXT,
    "resetPasswordOtpVerified" BOOLEAN,
    "resetPasswordOtpResendAvailableAt" TIMESTAMP(3),
    "resetPasswordOtpExpireAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "upvote" BOOLEAN NOT NULL DEFAULT true,
    "downvote" BOOLEAN NOT NULL DEFAULT true,
    "answerCreated" BOOLEAN NOT NULL DEFAULT true,
    "replyCreated" BOOLEAN NOT NULL DEFAULT true,
    "answerAccepted" BOOLEAN NOT NULL DEFAULT true,
    "answerMarkedBest" BOOLEAN NOT NULL DEFAULT true,
    "aiSuggestionUnlocked" BOOLEAN NOT NULL DEFAULT true,
    "aiAnswerUnlocked" BOOLEAN NOT NULL DEFAULT true,
    "similarQuestionsReady" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalStrikes" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "lastStrikeAt" TIMESTAMP(3),
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(15) NOT NULL,
    "description" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationStrike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aiDecision" "AiDecision",
    "aiConfidence" DOUBLE PRECISION,
    "aiReasons" TEXT[],
    "severity" INTEGER,
    "riskScore" DOUBLE PRECISION,
    "targetContentId" TEXT NOT NULL,
    "targetType" "ContentType" NOT NULL,
    "targetContentVersion" INTEGER,
    "strikedBy" "Mods" NOT NULL,
    "adminId" TEXT,
    "strikeReasons" TEXT,
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationStrike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "reasons" TEXT[],
    "severity" INTEGER,
    "warnedBy" "Mods" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ban" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "reasons" TEXT[],
    "banType" "BanType" NOT NULL,
    "severity" INTEGER,
    "bannedBy" "Mods" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ban_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationStats_userId_key" ON "ModerationStats"("userId");

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationStats" ADD CONSTRAINT "ModerationStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationStrike" ADD CONSTRAINT "ModerationStrike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ban" ADD CONSTRAINT "Ban_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
