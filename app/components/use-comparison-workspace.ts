import {useRef,useState} from 'react';
import type {GraphTaskContext} from '../../lib/graph-task';
import type {WorkspaceView} from '../../lib/workspace-navigation';
import {comparisonInputKey,writeComparisonInput,clearComparisonInput} from '../../lib/comparison-input';

/** Comparison navigation state has one owner; source pickers keep their own route drafts. */
export function useComparisonWorkspace(userId:string,spaceId:string){
  const [workbookTask,setWorkbookTask]=useState<GraphTaskContext>();
  const [workbookVersionId,setWorkbookVersionId]=useState('');
  const [workbookTrackId,setWorkbookTrackId]=useState<string|null>(null);
  const [workbookReturnView,setWorkbookReturnView]=useState<WorkspaceView>('threads');
  const [workbookViewState,setWorkbookViewState]=useState({panel:'evidence' as 'evidence'|'relations'|'task',focus:''});
  const loadedWorkbookRef=useRef('');
  const rememberVersion=(trackId:string,id:string)=>{
    loadedWorkbookRef.current=`${spaceId}:${trackId}:${id}`;
    if(workbookTask)clearComparisonInput(comparisonInputKey(userId,spaceId,trackId));
  };
  const beginComparison=(trackId:string,task:GraphTaskContext|undefined,versionId:string,from:WorkspaceView)=>{
    loadedWorkbookRef.current='';setWorkbookTask(task);setWorkbookVersionId(versionId);
    setWorkbookTrackId(trackId);setWorkbookReturnView(from);setWorkbookViewState({panel:'evidence',focus:''});
    const key=comparisonInputKey(userId,spaceId,trackId);
    if(task)return writeComparisonInput(key,task);
    if(!versionId)clearComparisonInput(key);
    return true;
  };
  return {workbookTask,setWorkbookTask,workbookVersionId,setWorkbookVersionId,workbookTrackId,setWorkbookTrackId,workbookReturnView,setWorkbookReturnView,workbookViewState,setWorkbookViewState,loadedWorkbookRef,beginComparison,rememberVersion};
}
