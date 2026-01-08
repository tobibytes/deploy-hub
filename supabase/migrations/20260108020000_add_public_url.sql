-- Add public_url column to deploy_containers table
ALTER TABLE deploy_containers 
ADD COLUMN IF NOT EXISTS public_url TEXT;
