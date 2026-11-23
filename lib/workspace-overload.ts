export function workspaceOverloadResponse(error: unknown) {
  if (!(error instanceof Error) || !/D1_ERROR:.*(?:overloaded|too many resources)/i.test(error.message)) return null;
  return Response.json({ error: 'Workspace storage is busy', code: 'workspace_busy' }, {
    status: 503, headers: { 'Retry-After': '10', 'Cache-Control': 'private, no-store' },
  });
}
