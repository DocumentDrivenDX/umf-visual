-- The workspace, its people and its configuration.
CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE agents (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  email text NOT NULL,
  role text NOT NULL -- agent or admin
);

CREATE TABLE settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
  default_tone text,
  auto_draft boolean NOT NULL
);

CREATE TABLE integrations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL, -- helpdesk or knowledge base
  connected_at timestamptz
);
