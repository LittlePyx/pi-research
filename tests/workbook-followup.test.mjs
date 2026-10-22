import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookCheckFocus,appendWorkbookResult} from '../lib/workbook-followup.ts';
import {workspaceHash,readWorkspaceLocation} from '../lib/workspace-navigation.ts';

test('reading focus prioritizes the user question, preserves task context and survives a URL round trip',()=>{
 const focus=workbookCheckFocus('Check the channel and encoder restrictions.','Which theorem applies?\nCompare its\tconditions.');
 assert.match(focus,/^Which theorem applies\? Compare its conditions\./);assert.match(focus,/channel and encoder/);
 assert.ok(workbookCheckFocus('g'.repeat(1000),'q'.repeat(4000)).length<=600);
 const origin=workspaceHash({view:'workbook',id:'route',space:'space',workbookId:'version'});
 const reading=workspaceHash({view:'paper-detail',id:'paper',space:'space',from:'workbook',returnTo:origin,readingFocus:focus});
 assert.equal(readWorkspaceLocation(reading).readingFocus,focus);
 assert.equal(workbookCheckFocus('  A\nB '),'A B');
});

test('explicit result append retains original judgment verbatim, is repeatable and never truncates',()=>{
 const original='  Original judgment\nwith qualifications.  ';
 const added=appendWorkbookResult(original,'Research check · Paper A','Source: abstract. Conditions remain unresolved.');
 assert.ok(added.startsWith(original+'\n\n'));assert.match(added,/Paper A/);
 assert.equal(appendWorkbookResult(added,'Research check · Paper A','Source: abstract. Conditions remain unresolved.'),added);
 assert.equal(appendWorkbookResult(original,'Check','  '),original);
 assert.equal(appendWorkbookResult('x'.repeat(3990),'Check','More source evidence'),null);
 assert.equal(original,'  Original judgment\nwith qualifications.  ');
});
