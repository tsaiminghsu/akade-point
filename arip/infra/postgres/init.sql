-- ARIP PostgreSQL initialization
-- Database 'arip' is already created via POSTGRES_DB env var

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  description TEXT,
  ip_address VARCHAR(45),
  firmware_version VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'offline',
  health VARCHAR(20) NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fleets table
CREATE TABLE IF NOT EXISTS fleets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fleet <-> Device join
CREATE TABLE IF NOT EXISTS fleet_devices (
  fleet_id UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fleet_id, device_id)
);

-- Workflow executions (used by all WorkflowProvider adapters)
CREATE TABLE IF NOT EXISTS workflow_executions (
  id VARCHAR(36) PRIMARY KEY,
  workflow_id VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  triggered_by VARCHAR(50),
  payload JSONB DEFAULT '{}',
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow versions (provider-agnostic snapshot storage)
CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plugin registry
CREATE TABLE IF NOT EXISTS plugins (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  manifest JSONB NOT NULL,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);
