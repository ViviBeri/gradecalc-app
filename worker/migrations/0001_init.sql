PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK(singleton = 1)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_invites_owner_created
  ON invites(owner_id, created_at);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  invite_id TEXT NOT NULL UNIQUE REFERENCES invites(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
  platform TEXT NOT NULL CHECK(platform IN ('web', 'android', 'ios', 'unknown')),
  app_version TEXT NOT NULL CHECK(length(app_version) <= 32),
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'paused', 'revoked')),
  created_at INTEGER NOT NULL,
  device_approved_at INTEGER,
  owner_approved_at INTEGER,
  last_seen_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_devices_owner_created
  ON devices(owner_id, created_at);

CREATE TABLE IF NOT EXISTS telemetry (
  device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_expiry
  ON telemetry(expires_at);

CREATE TABLE IF NOT EXISTS media_objects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 100),
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/ogg')),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 20971520),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_owner_created
  ON media_objects(owner_id, created_at);
