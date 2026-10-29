-- Background work.
CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL
);

CREATE TABLE job_runs (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);

CREATE TABLE schedules (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id),
  cron text NOT NULL
);
