-- Add container_port column to store the internal container port
ALTER TABLE deploy_containers 
ADD COLUMN container_port INTEGER DEFAULT 80;

-- Update existing rows to have the default value
UPDATE deploy_containers 
SET container_port = 80 
WHERE container_port IS NULL;
