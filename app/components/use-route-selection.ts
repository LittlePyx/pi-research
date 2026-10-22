import {useMemo,useState} from 'react';
import {comparisonInputKey,readComparisonInput,writeComparisonInput} from '../../lib/comparison-input';
import type {GraphTaskContext,GraphTaskPaper} from '../../lib/graph-task';

export type RouteSelection = {value:GraphTaskContext;change:(value:GraphTaskContext)=>void;toggle:(paper:GraphTaskPaper)=>void;seedQuestion:(question:string,onlyIfNew?:boolean)=>void;storageError:boolean};
export function useRouteSelection(userId:string,spaceId:string,trackId:string):RouteSelection {
  const key=comparisonInputKey(userId,spaceId,trackId,'picker');
  const [inputs,setInputs]=useState<Record<string,GraphTaskContext>>({});
  const [failed,setFailed]=useState('');
  const value=useMemo(()=>inputs[key]||readComparisonInput(key,spaceId)||{spaceId,question:'',papers:[]},[inputs,key,spaceId]);
  const change=(next:GraphTaskContext)=>{
    if(next.spaceId!==spaceId||next.papers.length>3)return;
    setInputs(current=>({...current,[key]:next}));
    setFailed(writeComparisonInput(key,next)?'':key);
  };
  return {value,change,storageError:failed===key,
    seedQuestion:(question,onlyIfNew=false)=>{if(onlyIfNew&&(inputs[key]||readComparisonInput(key,spaceId)))return;if(question&&!value.question)change({...value,question});},
    toggle:paper=>{
      const contains=value.papers.some(p=>p.canonicalId.toLowerCase()===paper.canonicalId.toLowerCase());
      if(!contains&&value.papers.length>=3)return;
      change({...value,papers:contains?value.papers.filter(p=>p.canonicalId.toLowerCase()!==paper.canonicalId.toLowerCase()):[...value.papers,paper]});
    }};
}
