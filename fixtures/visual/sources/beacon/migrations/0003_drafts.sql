-- Drafts, the articles they cite, and the agent's review.
CREATE TABLE kb_articles (
  id uuid PRIMARY KEY,
  external_ref text NOT NULL,
  title text NOT NULL
);

CREATE TABLE drafts (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  model_purpose text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE draft_sources (
  draft_id uuid NOT NULL REFERENCES drafts(id),
  article_id uuid NOT NULL REFERENCES kb_articles(id)
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES drafts(id),
  outcome text NOT NULL, -- sent, edited or discarded
  reviewed_at timestamptz NOT NULL
);

ALTER TABLE drafts ADD COLUMN tone text;
