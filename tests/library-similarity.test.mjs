import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCitationSimilarity, similarityGroups } from '../lib/library-similarity.ts';

const links=(ids,kind='reference')=>ids.map(canonicalId=>({canonicalId,title:canonicalId,kind}));
const paper=(id,links)=>({id,canonicalId:id,title:id,authors:'',year:'',url:'',links});

test('only shared literature yields a similarity edge and repeated records count once',()=>{
  const origin=paper('origin',links(['other','known-1','Known-1','known-2']));
  const direct=paper('other',links(['origin','known-1'],'citation'));
  const shared=paper('shared',links(['KNOWN-1','known-2']));
  const map=buildCitationSimilarity(origin,[direct,shared]);
  assert.deepEqual(map.papers.map(p=>p.id),['shared']);
  assert.equal(map.edges[0].references,2);
  assert.equal(map.edges[0].citing,0);
  assert.equal(map.edges[0].weight,2/Math.sqrt(6));
});

test('groups are linked through shared references or common citing papers between neighbors',()=>{
  const origin=paper('origin',[...links(['x','y']),...links(['m','n'],'citation')]);
  const a=paper('a',links(['x','y']));
  const b=paper('b',links(['x','y','z']));
  const c=paper('c',links(['m','n'],'citation'));
  const map=buildCitationSimilarity(origin,[a,b,c]);
  assert.deepEqual(similarityGroups(map).map(group=>group.map(p=>p.id)),[['a','b'],['c']]);
  assert.equal(map.edges.find(edge=>edge.to==='c').citing,2);
});
