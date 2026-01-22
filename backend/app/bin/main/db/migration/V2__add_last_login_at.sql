-- V2__add_last_login_at.sql
-- Add lastLoginAt column to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP WITH TIME ZONE;
