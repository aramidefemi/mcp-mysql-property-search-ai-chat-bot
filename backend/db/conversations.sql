-- Create conversations table for chat history
-- This is the ONLY table we are allowed to create/modify

CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) PRIMARY KEY,                     -- UUID v4
  user_ref VARCHAR(255) NULL,                  -- Optional user identifier
  messages JSON NOT NULL,                      -- Array of { role, content, ts }
  context JSON NULL,                           -- Additional context metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_user_ref (user_ref),
  INDEX idx_created_at (created_at),
  INDEX idx_updated_at (updated_at)
);