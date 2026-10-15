import { ensureSchema, getApiUser, getDatabase } from '../../../db/repository';
import { spaceDeletionAvailable } from '../../../lib/space-deletion';
import { comparisonLocation, type ComparisonContinuation } from '../../../lib/workbook-continuation';
import { workspaceHash } from '../../../lib/workspace-navigation';
import { workbookFocus } from '../../../lib/graph-task';

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const params = new URL(request.url).searchParams, spaceId = params.get('spaceId') || '';
  const db = getDatabase(); await ensureSchema(db);
  const deletionAvailable = await spaceDeletionAvailable(db);
  const space = await db.prepare(`SELECT id FROM research_spaces WHERE id=? AND owner_user_id=? ${deletionAvailable ? 'AND NOT EXISTS (SELECT 1 FROM research_space_deletions WHERE space_id=research_spaces.id)' : ''}`).bind(spaceId, user.userId).first();
  if (!space) return Response.json({ error: 'Space not found' }, { status: 404 });
  const preferred = comparisonLocation(params.get('location') || '', spaceId);
  type Row = { id: string; track_id: string; question: string; title_zh: string; title_en: string; status: ComparisonContinuation['status']; source_ids_json: string; saved_revision: number };
  const select = `SELECT w.id,w.track_id,w.question,w.status,w.source_ids_json,t.title_zh,t.title_en,
    COALESCE((SELECT MAX(a.revision) FROM research_comparison_artifacts a WHERE a.workbook_id=w.id AND a.space_id=w.space_id),0) AS saved_revision
    FROM research_comparison_workbooks w JOIN research_tracks t ON t.id=w.track_id AND t.space_id=w.space_id
    WHERE w.space_id=?`;
  const pinned = preferred ? await db.prepare(`${select} AND w.id=? AND w.track_id=?`).bind(spaceId, preferred.workbook.workbookId, preferred.workbook.id).first<Row>() : null;
  const row = pinned || await db.prepare(`${select} ORDER BY w.updated_at DESC,w.created_at DESC,w.rowid DESC LIMIT 1`).bind(spaceId).first<Row>();
  let continuation: ComparisonContinuation | null = null;
  if (row) {
    let sourceIds: string[] = [];
    try { const ids = JSON.parse(row.source_ids_json); if (Array.isArray(ids)) sourceIds = ids.filter((id): id is string => typeof id === 'string'); } catch { /* Historical malformed source lists are still openable. */ }
    let location = pinned && preferred ? preferred.location : { view: 'workbook' as const, id: row.track_id, space: spaceId, workbookId: row.id, workbookPanel: 'evidence' as const, from: 'today' as const, returnTo: workspaceHash({ view: 'today', space: spaceId }) };
    if (location.view === 'paper-detail' && (!sourceIds.includes(location.id!) || !await db.prepare('SELECT id FROM monitored_papers WHERE id=? AND space_id=?').bind(location.id, spaceId).first())) location = preferred!.workbook;
    const focus = workbookFocus(row.question);
    continuation = { hash: workspaceHash(location), titleZh: focus || row.title_zh, titleEn: focus || row.title_en, status: row.status, savedRevision: row.saved_revision, sourceCount: sourceIds.length };
  }
  return Response.json({ continuation }, { headers: { 'Cache-Control': 'private, no-store' } });
}
