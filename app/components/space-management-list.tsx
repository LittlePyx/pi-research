'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
export type ManagedSpace={id:string;name:string;description:string;memberName:string;accent:string;deletedAt?:string};
export function SpaceManagementList({spaces,activeId,locale,removed=false,available=true,onSelect,onChanged}:{spaces:ManagedSpace[];activeId?:string;locale:'zh'|'en';removed?:boolean;available?:boolean;onSelect?:(space:ManagedSpace)=>void;onChanged:(space:ManagedSpace,removed:boolean)=>void}){
 const zh=locale==='zh',[confirm,setConfirm]=useState<ManagedSpace|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),surface=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(confirm)surface.current?.querySelector<HTMLElement>('.pi-space-remove-confirm')?.focus()},[confirm]);
 const cancel=()=>{const id=confirm?.id;setConfirm(null);setError('');if(id)surface.current?.querySelector<HTMLElement>(`[data-remove-space="${id}"]`)?.focus()};
 const change=async(space:ManagedSpace)=>{
  if(busy||!available)return;setBusy(space.id);setError('');
  const removing=!removed;
  try{
   const response=await workspaceFetch('/api/spaces',{method:removing?'DELETE':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:space.id,...(removing?{confirmName:space.name}:{action:'restore'})}),signal:AbortSignal.timeout(20000)});
   const data=await response.json() as {space?:ManagedSpace;deleted?:boolean};
   if(!response.ok||data.space?.id!==space.id||data.deleted!==removing)throw Error();
   onChanged(data.space,removing);setConfirm(null);
  }catch{
   // Reconcile an uncertain response; never repeat the mutation automatically.
   const response=await workspaceFetch('/api/spaces',{signal:AbortSignal.timeout(10000)}).catch(()=>null);
   const data=response?.ok?await response.json().catch(()=>null) as {spaces?:ManagedSpace[];deletedSpaces?:ManagedSpace[]}|null:null;
   const found=(removing?data?.deletedSpaces:data?.spaces)?.find(row=>row.id===space.id);
   if(found){onChanged(found,removing);setConfirm(null)}
   else setError(zh?'操作暂未确认，资料保留。请刷新列表核对，或重试。':'The change could not be confirmed. Saved data is preserved. Reload the list or retry.');
  }finally{setBusy('')}
 };
 return <div className="pi-managed-spaces" ref={surface}>
  {removed&&<p className="pi-space-list-note">{zh?'文献与已保存笔记一并保留。恢复后，自动发现保持暂停。':'Papers and saved notes are retained. Automatic discovery stays paused after restoring.'}</p>}
  {error&&<p role="alert" className="pi-space-list-error">{error}</p>}
  {!spaces.length&&<p className="pi-space-list-empty">{removed?(zh?'没有已删除的空间。':'No deleted spaces.'):(zh?'还没有研究空间。':'No research spaces yet.')}</p>}
  {spaces.map(space=><article key={space.id} className={space.id===activeId?'current':''}>
   {removed?<div className="pi-space-item-body"><strong>{space.name}</strong><p>{space.description}</p></div>:<button className="pi-space-select" type="button" aria-pressed={space.id===activeId} disabled={Boolean(busy)} onClick={()=>onSelect?.(space)}><span className="pi-space-item-body"><strong>{space.name}</strong>{space.description&&<span>{space.description}</span>}</span>{space.id===activeId&&<small>{zh?'当前':'Current'}</small>}</button>}
   <button className={removed?'pi-space-restore':'pi-space-remove'} data-remove-space={space.id} type="button" disabled={Boolean(busy)||!available} aria-label={`${removed?(zh?'恢复':'Restore'):(zh?'删除':'Delete')} ${space.name}`} onClick={()=>removed?void change(space):setConfirm(space)}>{busy===space.id?(zh?'正在处理…':'Working…'):removed?(zh?'恢复':'Restore'):(zh?'删除':'Delete')}</button>
  </article>)}
  {!available&&<p className="pi-space-list-note">{zh?'空间删除服务尚未就绪，请稍后刷新。':'Space deletion is not yet available. Reload later.'}</p>}
  {confirm&&<section className="pi-space-remove-confirm" role="group" aria-label={zh?'确认删除空间':'Confirm space deletion'} tabIndex={-1}>
   <h3>{zh?'删除':'Delete'}「{confirm.name}」</h3><p>{zh?'空间及其文献、已保存笔记会移到「已删除」，可随时恢复。自动发现与分享页会暂停，进行中的请求可能完成。':'The space, papers and saved notes move to Deleted and can be restored. Automatic discovery and shared pages pause; requests already started may finish.'}</p><p>{zh?'请先保存正在编辑的笔记或问题。':'Save any notes or questions you are editing first.'}</p>
   <div><button className="pi-space-remove" type="button" disabled={Boolean(busy)} onClick={()=>void change(confirm)}>{busy?(zh?'正在删除…':'Deleting…'):(zh?'确认删除空间':'Confirm deletion')}</button><button type="button" disabled={Boolean(busy)} onClick={cancel}>{zh?'取消':'Cancel'}</button></div>
  </section>}
 </div>;
}
