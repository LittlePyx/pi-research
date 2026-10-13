'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
type Figure={url:string;caption:string;sourceUrl:string};
export function PaperFigure({spaceId,paperId,demo,locale}:{spaceId:string;paperId:string;demo:boolean;locale:'zh'|'en'}) {
 const [figure,setFigure]=useState<Figure|null>(null),[failed,setFailed]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(demo)return;
  const abort=new AbortController();
  workspaceFetch('/api/paper-figure?'+new URLSearchParams({spaceId,paperId}),{signal:abort.signal})
   .then(async r=>r.ok?r.json():null).then(data=>{if(!abort.signal.aborted)setFigure(data?.figure||null)}).catch(()=>{});
  return()=>abort.abort();
 },[spaceId,paperId,demo]);
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  // Native dialog provides Escape and focus return; backdrop dismissal is an additional pointer action.
  const dismiss=(event:MouseEvent)=>{if(event.target===element)element.close()};
  element.addEventListener('click',dismiss);
  return()=>element.removeEventListener('click',dismiss);
 },[figure,failed]);
 if(!figure||failed)return null;
 return <figure className="pi-poster-figure"><button type="button" onClick={()=>{dialog.current?.showModal();closeButton.current?.focus()}} aria-label={locale==='zh'?'放大论文首图':'Enlarge first figure'}><img src={figure.url} alt={figure.caption} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/><span>{locale==='zh'?'论文首图 · 点击放大':'First figure · Enlarge'} ↗</span></button><dialog ref={dialog} className="pi-figure-dialog" aria-label={locale==='zh'?'论文首图':'First figure'}><button ref={closeButton} className="pi-figure-close" type="button" onClick={()=>dialog.current?.close()} aria-label={locale==='zh'?'关闭首图':'Close figure'}>×</button><img src={figure.url} alt={figure.caption} referrerPolicy="no-referrer"/><p>{figure.caption}</p><a href={figure.sourceUrl} target="_blank" rel="noopener noreferrer">{locale==='zh'?'查看原论文图注':'View original figure caption'} ↗</a></dialog></figure>;
}
