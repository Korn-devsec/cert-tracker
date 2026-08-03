-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_VENDOR', 'WAITING_CA', 'TESTING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HistoryAction" AS ENUM ('IMPORT', 'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_DEACTIVATED', 'SITE_CREATED', 'SITE_UPDATED', 'CERTIFICATE_CREATED', 'CERTIFICATE_UPDATED', 'TASK_CREATED', 'ASSIGN', 'STATUS_CHANGE', 'CONTACT_VENDOR', 'CSR_GENERATED', 'CERTIFICATE_ISSUED', 'INSTALL', 'VERIFY', 'COMPLETE', 'CANCEL', 'ATTACHMENT_UPLOADED', 'NOTIFICATION_SENT');

-- CreateEnum
CREATE TYPE "NotificationTier" AS ENUM ('DAY_90', 'DAY_60', 'DAY_30', 'DAY_7');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'LINE');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT,
    "commonName" TEXT NOT NULL,
    "san" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issuer" TEXT,
    "serialNumber" TEXT,
    "signatureAlgorithm" TEXT,
    "keySize" INTEGER,
    "sha256Fingerprint" TEXT,
    "endpoint" TEXT NOT NULL DEFAULT '',
    "owner" TEXT,
    "remark" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalTask" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'NEW',
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryLog" (
    "id" TEXT NOT NULL,
    "action" "HistoryAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "actorId" TEXT,
    "detail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certificateId" TEXT,
    "companyId" TEXT,
    "renewalTaskId" TEXT,

    CONSTRAINT "HistoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "tier" "NotificationTier" NOT NULL,
    "sentOn" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipient" TEXT,
    "isSuccess" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sheetName" TEXT,
    "importedBy" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "errors" JSONB,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE INDEX "Company_isActive_idx" ON "Company"("isActive");

-- CreateIndex
CREATE INDEX "Site_companyId_idx" ON "Site"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_companyId_name_key" ON "Site"("companyId", "name");

-- CreateIndex
CREATE INDEX "Certificate_companyId_expiresAt_idx" ON "Certificate"("companyId", "expiresAt");

-- CreateIndex
CREATE INDEX "Certificate_expiresAt_idx" ON "Certificate"("expiresAt");

-- CreateIndex
CREATE INDEX "Certificate_siteId_idx" ON "Certificate"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_companyId_commonName_endpoint_key" ON "Certificate"("companyId", "commonName", "endpoint");

-- CreateIndex
CREATE INDEX "RenewalTask_certificateId_status_idx" ON "RenewalTask"("certificateId", "status");

-- CreateIndex
CREATE INDEX "RenewalTask_status_idx" ON "RenewalTask"("status");

-- CreateIndex
CREATE INDEX "RenewalTask_assigneeId_idx" ON "RenewalTask"("assigneeId");

-- CreateIndex
CREATE INDEX "HistoryLog_certificateId_createdAt_idx" ON "HistoryLog"("certificateId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryLog_companyId_createdAt_idx" ON "HistoryLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryLog_renewalTaskId_idx" ON "HistoryLog"("renewalTaskId");

-- CreateIndex
CREATE INDEX "HistoryLog_action_createdAt_idx" ON "HistoryLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_certificateId_idx" ON "Attachment"("certificateId");

-- CreateIndex
CREATE INDEX "NotificationLog_certificateId_tier_idx" ON "NotificationLog"("certificateId", "tier");

-- CreateIndex
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_certificateId_tier_channel_sentOn_key" ON "NotificationLog"("certificateId", "tier", "channel", "sentOn");

-- CreateIndex
CREATE INDEX "ImportBatch_companyId_createdAt_idx" ON "ImportBatch"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalTask" ADD CONSTRAINT "RenewalTask_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalTask" ADD CONSTRAINT "RenewalTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryLog" ADD CONSTRAINT "HistoryLog_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryLog" ADD CONSTRAINT "HistoryLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryLog" ADD CONSTRAINT "HistoryLog_renewalTaskId_fkey" FOREIGN KEY ("renewalTaskId") REFERENCES "RenewalTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
