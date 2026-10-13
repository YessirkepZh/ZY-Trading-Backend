-- Extension token works on a single device, bound on first use
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS device_id VARCHAR(64);

-- Only tokens revoked by rotation signal theft when reused; logout and session-limit evictions do not
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoke_reason VARCHAR(20);
