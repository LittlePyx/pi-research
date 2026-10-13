CREATE TABLE workspace_accounts (
 account_id TEXT PRIMARY KEY NOT NULL,
 owner_user_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_workspace_accounts_owner ON workspace_accounts(owner_user_id);
