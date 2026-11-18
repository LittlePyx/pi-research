import type {PreferenceSignal} from './preference-memory';
import type {ResearchMemoryItem,SavedComparison} from './research-memory-view';
import {SavedReadError} from './saved-read';

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const strings=(value:unknown)=>Array.isArray(value)&&value.every(item=>typeof item==='string');
export function preferenceResponse(value:unknown):{signals:PreferenceSignal[];scopeDescription:string}{
  if(!record(value)||!Array.isArray(value.signals)||!value.signals.every(signal=>record(signal)&&typeof signal.id==='string'&&['explicit','inferred'].includes(String(signal.layer))&&['kind','labelZh','labelEn','evidence','sourceType'].every(key=>typeof signal[key]==='string')))throw new SavedReadError('invalid');
  if(value.scopeDescription!=null&&typeof value.scopeDescription!=='string')throw new SavedReadError('invalid');
  return {signals:value.signals as PreferenceSignal[],scopeDescription:typeof value.scopeDescription==='string'?value.scopeDescription:''};
}
export type MemoryResponse={items:(ResearchMemoryItem&{demoExample?:boolean})[];total:number;offset:number;nextOffset:number|null};
export function memoryResponse(value:unknown):MemoryResponse{
  if(!record(value)||!Array.isArray(value.items)||!Number.isSafeInteger(value.total)||Number(value.total)<0||!Number.isSafeInteger(value.offset)||Number(value.offset)<0||!(value.nextOffset===null||Number.isSafeInteger(value.nextOffset)&&Number(value.nextOffset)>Number(value.offset))||!value.items.every(item=>record(item)&&['paperId','title','note','updatedAt','status','takeawayZh','takeawayEn'].every(key=>typeof item[key]==='string')&&['methodsZh','methodsEn','questionsZh','questionsEn'].every(key=>strings(item[key]))))throw new SavedReadError('invalid');
  return value as MemoryResponse;
}
export type ComparisonMemoryResponse={items:SavedComparison[];total:number;offset:number;nextOffset:number|null};
export function comparisonMemoryResponse(value:unknown):ComparisonMemoryResponse{
  if(!record(value)||!Array.isArray(value.items)||!Number.isSafeInteger(value.total)||Number(value.total)<0||!Number.isSafeInteger(value.offset)||Number(value.offset)<0||!(value.nextOffset===null||Number.isSafeInteger(value.nextOffset)&&Number(value.nextOffset)>Number(value.offset))||!value.items.every(item=>record(item)&&Number.isSafeInteger(item.revision)&&Number(item.revision)>0&&['workbookId','trackId','routeZh','routeEn','questionZh','questionEn','decision','unresolved','savedAt'].every(key=>typeof item[key]==='string')))throw new SavedReadError('invalid');
  return value as ComparisonMemoryResponse;
}
