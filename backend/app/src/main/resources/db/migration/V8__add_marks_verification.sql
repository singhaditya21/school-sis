-- V8: Add marks verification workflow columns
-- Supports maker-checker pattern for marks entry

-- Add verification columns to marks table (if exists)
DO $$
BEGIN
    -- Add verification status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'marks' AND column_name = 'verification_status') THEN
        ALTER TABLE marks ADD COLUMN "verificationStatus" VARCHAR(20) DEFAULT 'PENDING';
    END IF;

    -- Add verified by column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'marks' AND column_name = 'verified_by') THEN
        ALTER TABLE marks ADD COLUMN "verifiedBy" UUID;
    END IF;

    -- Add verified at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'marks' AND column_name = 'verified_at') THEN
        ALTER TABLE marks ADD COLUMN "verifiedAt" TIMESTAMP;
    END IF;

    -- Add rejection reason column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'marks' AND column_name = 'rejection_reason') THEN
        ALTER TABLE marks ADD COLUMN "rejectionReason" TEXT;
    END IF;
END $$;

-- Create index for pending verifications
CREATE INDEX IF NOT EXISTS idx_marks_verification_status 
    ON marks("verificationStatus") WHERE "verificationStatus" = 'PENDING';

COMMENT ON COLUMN marks."verificationStatus" IS 'PENDING, VERIFIED, REJECTED';
COMMENT ON COLUMN marks."verifiedBy" IS 'User ID who verified/rejected the marks';
COMMENT ON COLUMN marks."verifiedAt" IS 'Timestamp when marks were verified/rejected';
COMMENT ON COLUMN marks."rejectionReason" IS 'Reason for rejection if marks were rejected';
