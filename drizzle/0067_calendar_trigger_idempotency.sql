-- Preserve calendar history while making each trigger insert independently idempotent.
DROP TRIGGER IF EXISTS calendar_browsed_insert;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_browsed_insert AFTER INSERT ON paper_delivery_state WHEN NEW.opened_at IS NOT NULL BEGIN
INSERT INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.opened_at, '+8 hours'), 'browsed', NEW.opened_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.opened_at, '+8 hours') IS NOT NULL ON CONFLICT(space_id, day, paper_id, kind) DO NOTHING;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_browsed_update;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_browsed_update AFTER UPDATE ON paper_delivery_state WHEN NEW.opened_at IS NOT NULL AND NEW.opened_at IS NOT OLD.opened_at BEGIN
INSERT INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.opened_at, '+8 hours'), 'browsed', NEW.opened_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.opened_at, '+8 hours') IS NOT NULL ON CONFLICT(space_id, day, paper_id, kind) DO NOTHING;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_completed_insert;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_completed_insert AFTER INSERT ON paper_reading_progress WHEN NEW.status = 'read' AND NEW.completed_at IS NOT NULL BEGIN
INSERT INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.completed_at, '+8 hours'), 'completed', NEW.completed_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.completed_at, '+8 hours') IS NOT NULL ON CONFLICT(space_id, day, paper_id, kind) DO NOTHING;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_completed_update;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_completed_update AFTER UPDATE ON paper_reading_progress WHEN NEW.status = 'read' AND NEW.completed_at IS NOT NULL AND OLD.status IS NOT 'read' BEGIN
INSERT INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.completed_at, '+8 hours'), 'completed', NEW.completed_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.completed_at, '+8 hours') IS NOT NULL ON CONFLICT(space_id, day, paper_id, kind) DO NOTHING;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_recommended_insert;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_recommended_insert AFTER INSERT ON paper_insights WHEN NEW.llm_recommended = 1 AND NEW.last_recommended_at IS NOT NULL BEGIN
INSERT INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.last_recommended_at, '+8 hours'), 'recommended', NEW.last_recommended_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.last_recommended_at, '+8 hours') IS NOT NULL ON CONFLICT(space_id, day, paper_id, kind) DO NOTHING;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_recommended_update;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_recommended_update AFTER UPDATE ON paper_insights WHEN NEW.llm_recommended = 1 AND NEW.last_recommended_at IS NOT NULL AND NEW.last_recommended_at IS NOT OLD.last_recommended_at BEGIN
INSERT INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.last_recommended_at, '+8 hours'), 'recommended', NEW.last_recommended_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.last_recommended_at, '+8 hours') IS NOT NULL ON CONFLICT(space_id, day, paper_id, kind) DO NOTHING;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_original_browse;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_original_browse AFTER INSERT ON paper_engagement_events
WHEN NEW.kind IN ('detail_open','revisit','original_click') BEGIN
INSERT INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))),NEW.space_id,NEW.paper_id,date(NEW.occurred_at,'+8 hours'),'browsed',NEW.occurred_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.occurred_at,'+8 hours') IS NOT NULL ON CONFLICT(space_id, day, paper_id, kind) DO NOTHING;
END;
