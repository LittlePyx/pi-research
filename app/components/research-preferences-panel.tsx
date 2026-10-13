"use client";
import type {PreferenceSignal} from '../../lib/preference-memory';
import {preferenceResponse} from '../../lib/saved-memory-response';
import {ResearchPreferences} from './research-preferences';
import {useSavedRead} from './use-saved-read';

export function ResearchPreferencesPanel({spaceId,locale,demo,onToggle,onRecords,onPaper}:{spaceId:string;locale:'zh'|'en';demo:boolean;onToggle:(signal:PreferenceSignal,active:boolean)=>Promise<boolean>;onRecords:()=>void;onPaper:(id:string)=>void}){
  const read=useSavedRead(spaceId,'/api/preference-signals?'+new URLSearchParams({spaceId}),preferenceResponse);
  const toggle=async(signal:PreferenceSignal,active:boolean)=>{const ok=await onToggle(signal,active);if(ok)read.reload();return ok};
  return <ResearchPreferences signals={read.data?.signals||[]} scopeDescription={read.data?.scopeDescription||''} locale={locale} demo={demo} loading={read.loading} failed={Boolean(read.error)} failure={read.error} retrying={read.loading} onRetry={read.reload} onToggle={toggle} onRecords={onRecords} onPaper={onPaper}/>;
}
