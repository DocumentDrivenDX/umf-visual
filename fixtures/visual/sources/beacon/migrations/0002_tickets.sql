-- Tickets and what Beacon keeps about them.
CREATE TABLE customers (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  external_ref text NOT NULL
);

CREATE TABLE tickets (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  phase text NOT NULL,
  opened_at timestamptz NOT NULL
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  author text NOT NULL,
  sent_at timestamptz NOT NULL
);

CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES messages(id),
  object_key text NOT NULL,
  bytes bigint
);

CREATE TABLE tags (
  id uuid PRIMARY KEY,
  label text NOT NULL
);

CREATE TABLE ticket_tags (
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  tag_id uuid NOT NULL REFERENCES tags(id)
);
