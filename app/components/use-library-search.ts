'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
type Page<T>={papers:T[];total:number;offset:number;nextOffset:number|null;counts:{total:number;inbox:number;accepted:number;dismissed:number}};
export function useLibrarySearch<T>({spaceId,enabled,q,filter,stage,inbox,sort,tag,refresh}:{spaceId:string;enabled:boolean;q:string;filter:string;stage:string;inbox:string;sort:string;tag:string;refresh:string}) {
 const key=JSON.stringify([spaceId,q.trim(),filter,stage,inbox,sort,tag]);
 const [position,setPosition]=useState({key,offset:0}),[result,setResult]=useState<{key:string;data:Page<T>}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const sequence=useRef(0);
 const offset=position.key===key?position.offset:0;
 useEffect(()=>{
  const version=++sequence.current;
  if(!enabled)return;
  const abort=new AbortController();
  const timer=setTimeout(()=>{
   setBusy(true);setError(false);
   workspaceFetch('/api/library/search?'+new URLSearchParams({spaceId,q,filter,stage,inbox,sort,tag,offset:String(offset)}),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])})
    .then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Page<T>>})
    .then(data=>{if(!abort.signal.aborted&&sequence.current===version){if(!Array.isArray(data.papers)||!Number.isSafeInteger(data.total)||data.offset!==offset)throw Error();setResult({key,data})}})
    .catch(()=>{if(!abort.signal.aborted&&sequence.current===version)setError(true)})
    .finally(()=>{if(!abort.signal.aborted&&sequence.current===version)setBusy(false)});
  },180);
  return()=>{clearTimeout(timer);abort.abort()};
 },[enabled,spaceId,q,filter,stage,inbox,sort,tag,key,offset,refresh,retry]);
 const data=result?.key===key?result.data:null;
 return {data,busy:busy||enabled&&(!data||data.offset!==offset)&&!error,error,offset,setOffset:(offset:number)=>setPosition({key,offset}),retry:()=>setRetry(n=>n+1)};
}
