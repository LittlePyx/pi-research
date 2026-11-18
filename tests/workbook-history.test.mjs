import test from 'node:test';
import assert from 'node:assert/strict';
import {isWorkbookInspectorReturn,workbookInspectorReturn} from '../lib/workbook-history.ts';
const origin='#workbook/route?space=s&workbookId=v1&workbookPanel=task';
const current=origin+'&workbookFocus=objects%3Ap1';
test('inspector history only consumes its own same-workbook entry',()=>{
 const state={piWorkbookInspectorFrom:origin};assert.equal(workbookInspectorReturn(state,current),origin);
 const results=origin+'&workbookFocus=practice-results';assert.equal(workbookInspectorReturn({piWorkbookInspectorFrom:results},current),results);
 for(const hash of [current.replace('space=s','space=other'),current.replace('/route','/other'),current.replace('v1','v2'),'#library?space=s'])assert.equal(workbookInspectorReturn(state,hash),null);
 for(const state of [null,{}, {piWorkbookInspectorFrom:'https://example.com'}, {piWorkbookInspectorFrom:current},{piWorkbookInspectorFrom:'#workbook/route?space=s'}])assert.equal(workbookInspectorReturn(state,current),null);
});

test('only a same-workbook inspector close takes scroll ownership from generic navigation',()=>{
 assert.equal(isWorkbookInspectorReturn(current,origin),true);assert.equal(isWorkbookInspectorReturn(current,origin+'&workbookFocus=practice-results'),true);
 for(const target of [origin.replace('space=s','space=other'),origin.replace('/route','/other'),origin.replace('v1','v2'),'#library?space=s',current.replace('p1','p2')])assert.equal(isWorkbookInspectorReturn(current,target),false);
 assert.equal(isWorkbookInspectorReturn(origin,current),false);assert.equal(isWorkbookInspectorReturn(origin+'&workbookFocus=practice-results',origin),false);
});
