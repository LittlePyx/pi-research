"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {readSavedJson,savedReadFailure,type SavedReadFailure} from '../../lib/saved-read';

type ReadState<T>={scope:string;key:string;snapshot:{url:string;value:T}|null;error:SavedReadFailure|null};
/** One component-scoped snapshot; never carry another workspace's data into a new read. */
export function useSavedRead<T>(scope:string,url:string,decode:(value:unknown)=>T,enabled=true){
  const [revision,setRevision]=useState(0),[state,setState]=useState<ReadState<T>|null>(null);
  const key=JSON.stringify([scope,url,revision]);
  const current=useRef<{key:string;controller:AbortController}|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController(),request={key,controller};current.current=request;let active=true;
    void readSavedJson(url,decode,controller.signal).then(value=>{
      if(active&&!controller.signal.aborted)setState({scope,key,snapshot:{url,value},error:null});
    }).catch(error=>{
      const failure=savedReadFailure(error);if(!active||failure==='cancelled')return;
      setState(previous=>({scope,key,snapshot:['access','missing'].includes(failure)?null:previous?.scope===scope?previous.snapshot:null,error:failure}));
    });
    return()=>{active=false;controller.abort();if(current.current===request)current.current=null};
  },[scope,url,key,decode,enabled]);
  const reload=useCallback(()=>{
    if(current.current?.key!==key)return;
    current.current.controller.abort();setRevision(value=>value+1);
  },[key]);
  const snapshot=state?.scope===scope?state.snapshot:null;
  return {data:snapshot?.value??null,dataUrl:snapshot?.url??null,loading:enabled&&state?.key!==key,error:state?.key===key?state.error:null,reload};
}
