-- RAG: similar closed deals per user (pgvector). Extension is free OSS; available on Railway PG.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS deal_embeddings (
  deal_id      INTEGER PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  strategy     VARCHAR(40) NOT NULL,
  content_text TEXT NOT NULL,
  embedding    vector(64) NOT NULL,
  model        VARCHAR(40) NOT NULL DEFAULT 'structured-v1',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_embeddings_user_strategy
  ON deal_embeddings (user_id, strategy);

-- Small personal corpora: HNSW helps once dozens+ of closed deals exist
CREATE INDEX IF NOT EXISTS idx_deal_embeddings_hnsw
  ON deal_embeddings USING hnsw (embedding vector_cosine_ops);
