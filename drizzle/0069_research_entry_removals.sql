CREATE TABLE IF NOT EXISTS research_entry_removals (
  space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
  problem_id TEXT NOT NULL REFERENCES research_problems(id) ON DELETE CASCADE,
  removed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (space_id, problem_id)
);
