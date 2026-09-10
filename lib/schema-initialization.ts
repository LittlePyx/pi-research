// Bump when the bootstrap schema or its compatibility repairs change.
export const SCHEMA_BOOTSTRAP_REVISION = "0060-abstract-recovery-v1";

export function schemaInitializer(initialize: (database: D1Database) => Promise<void>) {
  const pending = new WeakMap<D1Database, Promise<void>>();
  return function ensure(database: D1Database): Promise<void> {
    const existing = pending.get(database);
    if (existing) return existing;
    const work = (async () => {
      const table = await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pi_schema_bootstrap'").first();
      if (table) {
        const done = await database.prepare("SELECT revision FROM pi_schema_bootstrap WHERE revision = ?")
          .bind(SCHEMA_BOOTSTRAP_REVISION).first();
        if (done) return;
      }
      await initialize(database);
      // Mark success only after every compatibility repair has completed.
      await database.prepare("CREATE TABLE IF NOT EXISTS pi_schema_bootstrap (revision TEXT PRIMARY KEY NOT NULL, completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
      await database.prepare("INSERT OR IGNORE INTO pi_schema_bootstrap (revision) VALUES (?)").bind(SCHEMA_BOOTSTRAP_REVISION).run();
    })();
    pending.set(database, work);
    void work.catch(() => { if (pending.get(database) === work) pending.delete(database); });
    return work;
  };
}
