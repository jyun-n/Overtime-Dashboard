-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UploadFileType" AS ENUM ('HR', 'OVERTIME');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdById" TEXT,
    "isWithdrawn" BOOLEAN NOT NULL DEFAULT false,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "fileType" "UploadFileType" NOT NULL,
    "yearMonth" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEmployee" (
    "id" TEXT NOT NULL,
    "empNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "jobGroup" TEXT NOT NULL,
    "uploadLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRecord" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "empNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "autoHours" DOUBLE PRECISION,
    "autoAmount" DOUBLE PRECISION,
    "excessHours" DOUBLE PRECISION,
    "excessAmount" DOUBLE PRECISION,
    "extensionHours" DOUBLE PRECISION,
    "totalAllowance" DOUBLE PRECISION,
    "hourlyWage" DOUBLE PRECISION,
    "uploadLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerLog" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "userId" TEXT,
    "ip" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isWithdrawn_idx" ON "User"("isWithdrawn");

-- CreateIndex
CREATE INDEX "LoginLog_userId_idx" ON "LoginLog"("userId");

-- CreateIndex
CREATE INDEX "LoginLog_loginAt_idx" ON "LoginLog"("loginAt");

-- CreateIndex
CREATE INDEX "UploadLog_userId_idx" ON "UploadLog"("userId");

-- CreateIndex
CREATE INDEX "UploadLog_uploadedAt_idx" ON "UploadLog"("uploadedAt");

-- CreateIndex
CREATE INDEX "UploadLog_fileType_idx" ON "UploadLog"("fileType");

-- CreateIndex
CREATE INDEX "UploadLog_yearMonth_idx" ON "UploadLog"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployee_empNo_key" ON "HrEmployee"("empNo");

-- CreateIndex
CREATE INDEX "HrEmployee_department_idx" ON "HrEmployee"("department");

-- CreateIndex
CREATE INDEX "HrEmployee_jobGroup_idx" ON "HrEmployee"("jobGroup");

-- CreateIndex
CREATE INDEX "OvertimeRecord_yearMonth_idx" ON "OvertimeRecord"("yearMonth");

-- CreateIndex
CREATE INDEX "OvertimeRecord_empNo_idx" ON "OvertimeRecord"("empNo");

-- CreateIndex
CREATE INDEX "OvertimeRecord_department_idx" ON "OvertimeRecord"("department");

-- CreateIndex
CREATE UNIQUE INDEX "OvertimeRecord_yearMonth_empNo_key" ON "OvertimeRecord"("yearMonth", "empNo");

-- CreateIndex
CREATE INDEX "ServerLog_level_idx" ON "ServerLog"("level");

-- CreateIndex
CREATE INDEX "ServerLog_createdAt_idx" ON "ServerLog"("createdAt");

-- CreateIndex
CREATE INDEX "ServerLog_userId_idx" ON "ServerLog"("userId");

-- CreateIndex
CREATE INDEX "ServerLog_path_idx" ON "ServerLog"("path");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginLog" ADD CONSTRAINT "LoginLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadLog" ADD CONSTRAINT "UploadLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerLog" ADD CONSTRAINT "ServerLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
