-- Add docker_container_id and local_url columns to containers table
ALTER TABLE public.containers 
ADD COLUMN IF NOT EXISTS docker_container_id TEXT,
ADD COLUMN IF NOT EXISTS local_url TEXT;
