'use client';
import {useState,type FormEvent} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {WorkspaceSession} from '../../lib/workspace-identity';
import {WorkspaceAccess} from './workspace-access';
import {SpaceManagementList,type ManagedSpace} from './space-management-list';

type Space={id:string;name:string;memberName:string;description:string;accent:string};
export function WorkspaceWelcome({locale,onLocale,session,onCreated,deletedSpaces=[],onRestored,demo=false}:{locale:'zh'|'en';onLocale:(locale:'zh'|'en')=>void;session:WorkspaceSession|null;onCreated:(space:Space)=>void;deletedSpaces?:ManagedSpace[];onRestored?:(space:ManagedSpace)=>void;demo?:boolean}){
 const zh=locale==='zh',[name,setName]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[intent,setIntent]=useState<'create'|'recover'|'deleted'>(demo?'deleted':'create');
 const locked=session?.mode==='locked';
 const create=async(e:FormEvent)=>{e.preventDefault();if(busy||!name.trim()||!description.trim())return;setBusy(true);setError('');
  try{const r=await workspaceFetch('/api/spaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,preferredLocale:locale}),signal:AbortSignal.timeout(20000)});const data=await r.json() as {space?:Space};if(!r.ok||!data.space?.id)throw Error();onCreated(data.space)}catch{
   // A response can fail after the insert committed. Reconcile before offering another insert.
   const r=await workspaceFetch('/api/spaces',{signal:AbortSignal.timeout(10000)}).catch(()=>null);const data=r?.ok?await r.json().catch(()=>null) as {spaces?:Space[]}|null:null;
   const match=data?.spaces?.find(s=>s.name===name.trim().slice(0,80)&&s.description===description.trim().slice(0,300));if(match){onCreated(match);return}
   setError(zh?'创建暂未确认，填写内容已保留。请重试；同名空间不会重复创建。':'Creation could not be confirmed. Your input is preserved. Retry; a duplicate name will not create another space.');setBusy(false)
  }
 };
 return <main className="pi-workspace-welcome">
  <header><div className="pi-welcome-brand"><span className="pi-welcome-mark" aria-hidden="true"/><strong>Pi Research</strong></div><div aria-label={zh?'语言':'Language'}><button type="button" aria-pressed={zh} onClick={()=>onLocale('zh')}>中文</button><button type="button" aria-pressed={!zh} onClick={()=>onLocale('en')}>EN</button></div></header>
  <div className="pi-welcome-layout">
   <div className="pi-welcome-heading"><h1>{demo?(zh?'恢复演示空间':'Restore a demo space'):locked?(zh?'回到你的研究':'Return to your research'):(zh?'开始你的研究':'Start your research')}</h1><p>{demo?(zh?'选择一个空间，继续体验。刷新后演示会重置。':'Choose a space to continue. The demo resets on reload.'):locked?(zh?'登录原账号，继续已有的研究。':'Sign in with your original account to continue.'):(zh?'一个研究方向，一个持续积累的空间。':'A space for your research to grow.')}</p></div>
   <div className="pi-welcome-card">
    {!locked&&<nav className="pi-welcome-intent" aria-label={zh?'开始方式':'Get started'}>{!demo&&<><button type="button" aria-pressed={intent==='create'} disabled={busy} onClick={()=>setIntent('create')}>{zh?'创建研究空间':'Create a space'}</button><button type="button" aria-pressed={intent==='recover'} disabled={busy} onClick={()=>setIntent('recover')}>{zh?'恢复工作区':'Recover workspace'}</button></>}{deletedSpaces.length>0&&<button type="button" aria-pressed={intent==='deleted'} disabled={busy} onClick={()=>setIntent('deleted')}>{zh?'已删除':'Deleted'} ({deletedSpaces.length})</button>}</nav>}
    {!locked&&!demo&&<form hidden={intent!=='create'} onSubmit={e=>void create(e)}>
     <label>{zh?'空间名称':'Space name'}<input required maxLength={80} autoComplete="off" value={name} onChange={e=>setName(e.target.value)} placeholder={zh?'例如：信息论':'e.g. Information theory'}/></label>
     <label>{zh?'研究方向':'Research direction'}<textarea required maxLength={300} value={description} onChange={e=>setDescription(e.target.value)} placeholder={zh?'你关注什么领域，或想解决什么问题？':'What field or question are you exploring?'}/></label>
     <p className="pi-welcome-form-note">{zh?'Pi 会围绕这个方向发现文献，整理阅读线索。':'Pi will discover papers and reading leads around this direction.'}</p>
     {error&&<p role="alert">{error}</p>}
     <button type="submit" disabled={busy||!name.trim()||!description.trim()}>{busy?(zh?'正在创建…':'Creating…'):(zh?'创建并进入空间':'Create & enter space')}</button>
    </form>}
    <div hidden={!locked&&intent!=='recover'}><WorkspaceAccess session={session} locale={locale} demo={demo}/></div>
    {!locked&&intent==='deleted'&&<SpaceManagementList spaces={deletedSpaces} locale={locale} removed onChanged={space=>onRestored?.(space)}/>}
   </div>
   <a className="pi-welcome-demo" href={demo?'/':'/demo'}>{demo?(zh?'返回正式工作区':'Return to your workspace'):(zh?'先体验演示空间':'Explore the demo')}<span aria-hidden="true">↗</span></a>
  </div>
 </main>;
}
