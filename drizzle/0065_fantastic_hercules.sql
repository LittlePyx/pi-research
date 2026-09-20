CREATE TABLE `reading_calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reading_calendar_daily` ON `reading_calendar_events` (`space_id`,`day`,`paper_id`,`kind`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_browsed_insert AFTER INSERT ON paper_delivery_state WHEN NEW.opened_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.opened_at, '+8 hours'), 'browsed', NEW.opened_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.opened_at, '+8 hours') IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_browsed_update AFTER UPDATE ON paper_delivery_state WHEN NEW.opened_at IS NOT NULL AND NEW.opened_at IS NOT OLD.opened_at BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.opened_at, '+8 hours'), 'browsed', NEW.opened_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.opened_at, '+8 hours') IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_completed_insert AFTER INSERT ON paper_reading_progress WHEN NEW.status = 'read' AND NEW.completed_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.completed_at, '+8 hours'), 'completed', NEW.completed_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.completed_at, '+8 hours') IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_completed_update AFTER UPDATE ON paper_reading_progress WHEN NEW.status = 'read' AND NEW.completed_at IS NOT NULL AND OLD.status IS NOT 'read' BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.completed_at, '+8 hours'), 'completed', NEW.completed_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.completed_at, '+8 hours') IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_recommended_insert AFTER INSERT ON paper_insights WHEN NEW.llm_recommended = 1 AND NEW.last_recommended_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.last_recommended_at, '+8 hours'), 'recommended', NEW.last_recommended_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.last_recommended_at, '+8 hours') IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_recommended_update AFTER UPDATE ON paper_insights WHEN NEW.llm_recommended = 1 AND NEW.last_recommended_at IS NOT NULL AND NEW.last_recommended_at IS NOT OLD.last_recommended_at BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), NEW.space_id, NEW.paper_id, date(NEW.last_recommended_at, '+8 hours'), 'recommended', NEW.last_recommended_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.last_recommended_at, '+8 hours') IS NOT NULL;
END;
--> statement-breakpoint
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))), b.space_id,p.id,b.brief_date,'recommended',b.created_at
FROM monitor_daily_briefs b, json_each(CASE WHEN json_valid(b.paper_ids) THEN b.paper_ids ELSE '[]' END) j
JOIN monitored_papers p ON p.id=j.value AND p.space_id=b.space_id
WHERE b.brief_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
--> statement-breakpoint
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))),e.space_id,e.paper_id,date(e.occurred_at,'+8 hours'),'browsed',MIN(e.occurred_at)
FROM paper_engagement_events e JOIN monitored_papers p ON p.id=e.paper_id AND p.space_id=e.space_id
WHERE e.kind IN ('detail_open','revisit','original_click') AND date(e.occurred_at,'+8 hours') IS NOT NULL
GROUP BY e.space_id,e.paper_id,date(e.occurred_at,'+8 hours');
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS calendar_original_browse AFTER INSERT ON paper_engagement_events
WHEN NEW.kind IN ('detail_open','revisit','original_click') BEGIN
INSERT OR IGNORE INTO reading_calendar_events (id,space_id,paper_id,day,kind,occurred_at)
SELECT lower(hex(randomblob(16))),NEW.space_id,NEW.paper_id,date(NEW.occurred_at,'+8 hours'),'browsed',NEW.occurred_at
WHERE EXISTS (SELECT 1 FROM monitored_papers WHERE id=NEW.paper_id AND space_id=NEW.space_id) AND date(NEW.occurred_at,'+8 hours') IS NOT NULL;
END;
