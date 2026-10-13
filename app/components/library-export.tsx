'use client';
import {useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
export function LibraryExport({spaceId,locale}:{spaceId:string;locale:'zh'|'en'}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);
 const download=async(format:string,scope:string)=>{
  if(busy)return;setBusy(true);setError(false);
  try{
   const r=await workspaceFetch('/api/library?'+new URLSearchParams({spaceId,format,scope}));if(!r.ok)throw Error();
   const blob=await r.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`PiResearch.${format==='bibtex'?'bib':format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{setError(true)}finally{setBusy(false)}
 };
 return <details className="v2-library-export"><summary>{locale==='zh'?'导出资料':'Export records'}</summary><div className="v2-library-head-actions">
  <button type="button" disabled={busy} onClick={()=>void download('json','all')}>{locale==='zh'?'全库文献与笔记 · JSON':'All papers & notes · JSON'}</button>
  <button type="button" disabled={busy} onClick={()=>void download('bibtex','all')}>{locale==='zh'?'全部文献 · BibTeX':'All papers · BibTeX'}</button>
  <button type="button" disabled={busy} onClick={()=>void download('ris','all')}>{locale==='zh'?'全部文献 · RIS / Zotero':'All papers · RIS / Zotero'}</button>
  <button type="button" disabled={busy} onClick={()=>void download('bibtex','accepted')}>{locale==='zh'?'收藏与阅读资料 · BibTeX':'Saved & reading · BibTeX'}</button>
  {busy&&<p role="status">{locale==='zh'?'正在整理导出资料…':'Preparing export…'}</p>}
  {error&&<p role="alert">{locale==='zh'?'导出未完成，请重试。':'Export did not finish. Retry.'}</p>}
 </div></details>;
}
