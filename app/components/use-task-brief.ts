'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {TaskBriefView} from '../../lib/task-brief';
export function useTaskBrief(spaceId:string,enabled:boolean,refresh:string){
 const [saved,setSaved]=useState<{spaceId:string;brief:TaskBriefView|null}|null>(null),[failedSpace,setFailedSpace]=useState<string|null>(null);
 const version=useRef(0);
 useEffect(()=>{
  const request=++version.current;if(!enabled)return;
  const abort=new AbortController();
  workspaceFetch('/api/task-brief?'+new URLSearchParams({spaceId}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])})
   .then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<{brief:TaskBriefView|null}>})
   .then(data=>{if(!abort.signal.aborted&&version.current===request){if(!('brief' in data))throw Error();setSaved({spaceId,brief:data.brief});setFailedSpace(null)}})
   .catch(()=>{if(!abort.signal.aborted&&version.current===request)setFailedSpace(spaceId)});
  return()=>abort.abort();
 },[spaceId,enabled,refresh]);
 return {brief:saved?.spaceId===spaceId?saved.brief:null,error:enabled&&failedSpace===spaceId,patchPaper:(paperId:string,changes:Partial<TaskBriefView['currentStates'][number]>)=>{
  version.current++;
  setSaved(current=>current?.spaceId===spaceId&&current.brief?{...current,brief:{...current.brief,currentStates:current.brief.currentStates.map(s=>s.paperId===paperId?{...s,...changes}:s)}}:current);
 }};
}
