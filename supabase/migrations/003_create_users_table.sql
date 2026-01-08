-- Create users table for authentication
CREATE TABLE IF NOT EXISTS deploy_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add user_id to existing tables
ALTER TABLE deploy_projects 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES deploy_users(id) ON DELETE CASCADE;

ALTER TABLE deploy_containers 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES deploy_users(id) ON DELETE CASCADE;

ALTER TABLE deploy_deployments 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES deploy_users(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON deploy_users(email);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON deploy_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_containers_user_id ON deploy_containers(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_user_id ON deploy_deployments(user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON deploy_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
