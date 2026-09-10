import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const compiled = await build({ entryPoints:[fileURLToPath(new URL('../lib/abstract-recovery.ts',import.meta.url))], bundle:true, write:false, platform:'node', format:'esm' });
const { lookupAbstract, matchesAbstractIdentity } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const paper = { doi: '10.1234/paper', title: 'A precise research question', authors: 'Ada Lovelace, Test Author', url: '' };
test('abstract identities reject conflicting DOI and same title with a different author', () => {
  assert.equal(matchesAbstractIdentity(paper, { doi: '10.1234/wrong', title: paper.title, authors: ['Ada Lovelace'] }), false);
  assert.equal(matchesAbstractIdentity(paper, { title: paper.title, authors: ['Other Person'] }), false);
  assert.equal(matchesAbstractIdentity(paper, { title: paper.title, authors: ['Ada Lovelace'] }), true);
});
test('lookup skips wrong DOI and finds exact title and author in a preprint', async () => {
  const abstract = 'A verifiable abstract from an isolated fixture, not a scientific finding. '.repeat(4);
  const result = await lookupAbstract(paper, async (_url, source) => {
    if (source === 'crossref') return Response.json({ message: { DOI: '10.1234/wrong', abstract } });
    if (source === 'openalex') return Response.json({ doi: '10.1234/wrong' });
    if (source === 'datacite') return Response.json({ data: [] });
    return new Response(`<feed><entry><id>http://arxiv.org/abs/2506.18613</id><title>${paper.title}</title><summary>${abstract}</summary><author><name>Ada Lovelace</name></author></entry></feed>`);
  });
  assert.equal(result.hit.abstractText, abstract.trim());
  assert.equal(result.hit.sourceUrl, 'https://arxiv.org/abs/2506.18613');
  assert.equal(result.failed, false);
});
test('unavailable sources differ from completed searches with no matching abstract', async () => {
  const missing = await lookupAbstract(paper, async () => new Response('', { status: 404 }));
  const failed = await lookupAbstract(paper, async () => new Response('', { status: 503 }));
  assert.equal(missing.hit, null); assert.equal(missing.failed, false);
  assert.equal(failed.hit, null); assert.equal(failed.failed, true);
});
