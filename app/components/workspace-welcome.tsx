'use client';
import {useState,type FormEvent} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {WorkspaceSession} from '../../lib/workspace-identity';
import {WorkspaceAccess} from './workspace-access';

type Space={id:string;name:string;memberName:string;description:string;accent:string};
export function WorkspaceWelcome({locale,onLocale,session,onCreated}:{locale:'zh'|'en';onLocale:(locale:'zh'|'en')=>void;session:WorkspaceSession|null;onCreated:(space:Space)=>void}){
 const zh=locale==='zh',[name,setName]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const create=async(e:FormEvent)=>{e.preventDefault();if(busy||!name.trim()||!description.trim())return;setBusy(true);setError('');
  try{const r=await workspaceFetch('/api/spaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,preferredLocale:locale}),signal:AbortSignal.timeout(20000)});const data=await r.json() as {space?:Space};if(!r.ok||!data.space?.id)throw Error();onCreated(data.space)}catch{
   // A response can fail after the insert committed. Reconcile before offering another insert.
   const r=await workspaceFetch('/api/spaces',{signal:AbortSignal.timeout(10000)}).catch(()=>null);const data=r?.ok?await r.json().catch(()=>null) as {spaces?:Space[]}|null:null;
   const match=data?.spaces?.find(s=>s.name===name.trim().slice(0,80)&&s.description===description.trim().slice(0,300));if(match){onCreated(match);return}
   setError(zh?'创建暂未确认，填写内容已保留。请重试；同名空间不会重复创建。':'Creation could not be confirmed. Your input is preserved. Retry; a duplicate name will not create another space.');setBusy(false)
  }
 };
 return <main className="pi-workspace-welcome"><header><strong>Pi Research</strong><div><button type="button" aria-pressed={zh} onClick={()=>onLocale('zh')}>中文</button><button type="button" aria-pressed={!zh} onClick={()=>onLocale('en')}>EN</button></div></header><div className="pi-welcome-layout"><section><p className="pi-welcome-kicker">YOUR RESEARCH SPACE</p><h1>{session?.mode==='locked'?(zh?'回到你的研究':'Return to your research'):(zh?'从你的研究方向开始':'Start with your research')}</h1><p>{zh?'建立自己的空间，让文献、阅读和研究判断围绕同一个方向积累。':'Create your own space to build a connected record of literature, reading and research decisions.'}</p>{session?.mode!=='locked'&&<form onSubmit={e=>void create(e)}><label>{zh?'空间名称':'Space name'}<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder={zh?'例如：有限码长信息论':'e.g. Finite blocklength information theory'}/></label><label>{zh?'研究方向或想回答的问题':'Research area or question'}<textarea required maxLength={300} value={description} onChange={e=>setDescription(e.target.value)} placeholder={zh?'写下研究对象、方法或当前关注的问题':'Describe the object, methods or question you are working on'}/></label>{error&&<p role="alert">{error}</p>}<button type="submit" disabled={busy||!name.trim()||!description.trim()}>{busy?(zh?'正在创建…':'Creating…'):(zh?'创建我的空间':'Create my space')}</button><p className="pi-access-note">{zh?'创建后进入今日页，围绕这个方向发现与阅读文献。':'Enter Today to discover and read literature around this direction.'}</p></form>}<a className="pi-welcome-demo" href="/demo">{zh?'先看看演示空间':'Explore the demo first'} ↗</a></section><WorkspaceAccess session={session} locale={locale}/></div></main>;
}
