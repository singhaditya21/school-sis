-- V4__convert_role_to_varchar.sql
-- Convert role column from PostgreSQL enum type to VARCHAR for compatibility with JPA @Enumerated

-- First, alter the column to text (temporarily)
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50) USING role::text;

-- Drop the enum type if it exists (optional - keep if other tables use it)
-- DROP TYPE IF EXISTS "UserRole";
