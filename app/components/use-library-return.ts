import {useEffect,useRef} from 'react';
import {readWorkspaceLocation} from '../../lib/workspace-navigation';
import {sessionDraftKey,readSessionDraft,writeSessionDraft} from '../../lib/session-draft';

/** Keep reading position separate from URL filters and from research content drafts. */
export function useLibraryReturn(userId:string,spaceId:string,visible:boolean,ready:boolean,identity:string){
  const restored=useRef('');
  const remember=(paperId:string)=>{
    const hash=window.location.hash;
    const row=[...document.querySelectorAll<HTMLElement>('[data-library-paper]')].find(e=>e.dataset.libraryPaper===paperId);
    const key=sessionDraftKey(userId,spaceId,`library-position:${hash}`);
    writeSessionDraft(key,'',JSON.stringify({paperId,top:window.scrollY,offset:row?.getBoundingClientRect().top||0}));
    restored.current='';
  };
  useEffect(()=>{
    if(!visible||!ready)return;
    const hash=window.location.hash,location=readWorkspaceLocation(hash);
    if(location.view!=='library'||location.space!==spaceId)return;
    const key=sessionDraftKey(userId,spaceId,`library-position:${hash}`);
    const raw=readSessionDraft(key)?.value;
    if(!raw||restored.current===key)return;
    let value:{paperId:string;top:number;offset:number};
    try{value=JSON.parse(raw);if(typeof value.paperId!=='string'||!Number.isFinite(value.top)||value.top<0||value.top>1000000||!Number.isFinite(value.offset))return;}catch{return;}
    let cancelled=false;
    const frame=requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(cancelled||window.location.hash!==hash)return;
      restored.current=key;
      const row=[...document.querySelectorAll<HTMLElement>('[data-library-paper]')].find(e=>e.dataset.libraryPaper===value.paperId);
      window.scrollTo({top:Math.max(0,row?window.scrollY+row.getBoundingClientRect().top-value.offset:value.top),behavior:'auto'});
      row?.querySelector<HTMLElement>('.v2-library-paper-main')?.focus({preventScroll:true});
    })));
    return()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[userId,spaceId,visible,ready,identity]);
  return remember;
}
