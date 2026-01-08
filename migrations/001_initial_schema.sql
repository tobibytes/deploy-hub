-- Deploy Hub Initial Schema
-- Creates all tables with deploy_ prefix

-- Enable required extensions (Neon-compatible)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum for container status
CREATE TYPE deploy_container_status AS ENUM ('pending', 'building', 'running', 'stopped', 'failed', 'deploying');

-- Create enum for deployment status
CREATE TYPE deploy_deployment_status AS ENUM ('pending', 'building', 'deploying', 'success', 'failed', 'cancelled');

-- Create profiles table
CREATE TABLE IF NOT EXISTS deploy_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create projects table
CREATE TABLE IF NOT EXISTS deploy_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    repository_url TEXT,
    framework TEXT DEFAULT 'docker',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create containers table
CREATE TABLE IF NOT EXISTS deploy_containers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES deploy_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    status deploy_container_status DEFAULT 'pending' NOT NULL,
    port INTEGER,
    docker_container_id TEXT,
    local_url TEXT,
    environment_variables JSONB DEFAULT '{}',
    cpu_limit TEXT DEFAULT '0.5',
    memory_limit TEXT DEFAULT '512Mi',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create deployments table
CREATE TABLE IF NOT EXISTS deploy_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id UUID NOT NULL REFERENCES deploy_containers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status deploy_deployment_status DEFAULT 'pending' NOT NULL,
    commit_hash TEXT,
    logs TEXT[],
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create domains table
CREATE TABLE IF NOT EXISTS deploy_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id UUID NOT NULL REFERENCES deploy_containers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    is_verified BOOLEAN DEFAULT false,
    ssl_enabled BOOLEAN DEFAULT false,
    verification_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_deploy_profiles_user_id ON deploy_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_projects_user_id ON deploy_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_containers_user_id ON deploy_containers(user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_containers_project_id ON deploy_containers(project_id);
CREATE INDEX IF NOT EXISTS idx_deploy_deployments_user_id ON deploy_deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_deployments_container_id ON deploy_deployments(container_id);
CREATE INDEX IF NOT EXISTS idx_deploy_domains_user_id ON deploy_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_domains_container_id ON deploy_domains(container_id);
