import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonInputKey,readComparisonInput,writeComparisonInput,clearComparisonInput} from '../lib/comparison-input.ts';
test('comparison intent survives refresh and stays isolated by owner, space, route and version',()=>{
 const before=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 try{
  const key=comparisonInputKey('u','s','t'),context={spaceId:'s',question:'Compare the stated assumptions',papers:[{canonicalId:'arxiv:1',title:'Actual selected paper'}]};
  assert.equal(writeComparisonInput(key,context),true);assert.deepEqual(readComparisonInput(key,'s'),context);
  for(const parts of [['other','s','t'],['u','other','t'],['u','s','other'],['u','s','t','old-version']])assert.equal(readComparisonInput(comparisonInputKey(...parts),'s'),undefined);
  assert.equal(readComparisonInput(key,'other'),undefined);
  assert.equal(writeComparisonInput(key,{spaceId:'s',question:'',papers:[]}),true);assert.deepEqual(readComparisonInput(key,'s')?.papers,[],'explicitly deselecting every paper does not restore defaults');
  clearComparisonInput(key);assert.equal(readComparisonInput(key,'s'),undefined);
  values.set(key,JSON.stringify({base:'',value:JSON.stringify({...context,papers:[{},{}]})}));assert.equal(readComparisonInput(key,'s'),undefined);
 }finally{if(before===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=before;}
});
test('unavailable session storage is reported without losing the live input',()=>{
 const key=comparisonInputKey('u','s','t');assert.equal(writeComparisonInput(key,{spaceId:'s',question:'Current text',papers:[]}),false);assert.equal(readComparisonInput(key,'s'),undefined);
});
