export const readingCalendarBootstrapSql = [
`CREATE TABLE IF NOT EXISTS reading_calendar_events (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, day TEXT NOT NULL, kind TEXT NOT NULL, occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
`CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_calendar_daily ON reading_calendar_events(space_id, day, paper_id, kind)`,
`CREATE TRIGGER IF NOT EXISTS calendar_browsed_insert AFTER INSERT ON paper_delivery_state WHEN NEW.opened_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.opened_at, '+8 hours'), 'browsed', NEW.opened_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.opened_at, '+8 hours') IS NOT NULL;
END`,
`CREATE TRIGGER IF NOT EXISTS calendar_browsed_update AFTER UPDATE ON paper_delivery_state WHEN NEW.opened_at IS NOT NULL AND NEW.opened_at IS NOT OLD.opened_at BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.opened_at, '+8 hours'), 'browsed', NEW.opened_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.opened_at, '+8 hours') IS NOT NULL;
END`,
`CREATE TRIGGER IF NOT EXISTS calendar_completed_insert AFTER INSERT ON paper_reading_progress WHEN NEW.status = 'read' AND NEW.completed_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.completed_at, '+8 hours'), 'completed', NEW.completed_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.completed_at, '+8 hours') IS NOT NULL;
END`,
`CREATE TRIGGER IF NOT EXISTS calendar_completed_update AFTER UPDATE ON paper_reading_progress WHEN NEW.status = 'read' AND NEW.completed_at IS NOT NULL AND OLD.status IS NOT 'read' BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.completed_at, '+8 hours'), 'completed', NEW.completed_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.completed_at, '+8 hours') IS NOT NULL;
END`,
`CREATE TRIGGER IF NOT EXISTS calendar_recommended_insert AFTER INSERT ON paper_insights WHEN NEW.llm_recommended = 1 AND NEW.last_recommended_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.last_recommended_at, '+8 hours'), 'recommended', NEW.last_recommended_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.last_recommended_at, '+8 hours') IS NOT NULL;
END`,
`CREATE TRIGGER IF NOT EXISTS calendar_recommended_update AFTER UPDATE ON paper_insights WHEN NEW.llm_recommended = 1 AND NEW.last_recommended_at IS NOT NULL AND NEW.last_recommended_at IS NOT OLD.last_recommended_at BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.last_recommended_at, '+8 hours'), 'recommended', NEW.last_recommended_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.last_recommended_at, '+8 hours') IS NOT NULL;
END`,
`CREATE TRIGGER IF NOT EXISTS calendar_original_browse AFTER INSERT ON paper_engagement_events
WHEN NEW.kind IN ('detail_open','revisit','original_click') BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))),NEW.space_id,NEW.paper_id,date(NEW.occurred_at,'+8 hours'),'browsed',NEW.occurred_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.occurred_at,'+8 hours') IS NOT NULL;
END`];

export function calendarMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start: `${value}-01`, end, days: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}
export function calendarDay(value: string, month: string) {
  const range = calendarMonth(month);
  return !!range && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= range.start && value < range.end && Number(value.slice(8)) <= range.days;
}
