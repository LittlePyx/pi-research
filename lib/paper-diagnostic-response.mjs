import { readPaperDiagnostic } from './paper-diagnostic.mjs';

// Uses the existing workspace-owner boundary, not scheduler/admin credentials.
// No bootstrap, background work, arbitrary query or user-facing audit surface.
export async function paperDiagnosticResponse(request, getUser, getDatabase) {
  const reply = (body, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' },
  });
  const user = getUser(request);
  if (!user) return reply({ error: 'unauthorized' }, 401);
  const params = new URL(request.url).searchParams;
  const spaceId = params.get('spaceId');
  const ids = params.getAll('canonicalId');
  if ([...params.keys()].some(key => !['spaceId', 'canonicalId'].includes(key))
    || params.getAll('spaceId').length !== 1 || !spaceId?.trim() || spaceId.length > 128
    || !ids.length || ids.length > 8 || ids.some(id => !id.trim() || id.length > 300)) {
    return reply({ error: 'invalid_query' }, 400);
  }
  try {
    const database = getDatabase();
    const owned = await database.prepare('SELECT id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1')
      .bind(spaceId, user.userId).first();
    if (!owned) return reply({ error: 'space_not_found' }, 404);
    return reply(await readPaperDiagnostic(database, spaceId, ids));
  } catch {
    // Never echo query, SQL, runtime configuration or upstream error messages.
    return reply({ error: 'diagnostic_unavailable' }, 503);
  }
}
