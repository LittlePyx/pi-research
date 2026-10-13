'use client';
import {useState} from 'react';
import {workspaceFetch} from '../../lib/workspace-request';
import type {WorkspaceSession} from '../../lib/workspace-identity';

export function WorkspaceAccess({session,locale,demo=false}:{session:WorkspaceSession|null;locale:'zh'|'en';demo?:boolean}) {
  const zh=locale==='zh', [confirm,setConfirm]=useState<'connect'|'restore'|'browser'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const change=async()=>{
    if(!confirm||busy||demo)return;setBusy(true);setError('');
    try{
      let legacyWorkspaceId:string|null=null;
      if(confirm==='browser'){try{legacyWorkspaceId=localStorage.getItem('pi-anonymous-workspace')}catch{throw Error('unavailable')}}
      const r=await workspaceFetch('/api/workspace-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:confirm,...(confirm==='browser'?{legacyWorkspaceId}:{})}),signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw Error(r.status===409?'conflict':r.status===401?'signin':r.status===404?'missing':'unavailable');
      const data=await r.json() as WorkspaceSession;if(confirm==='browser'?!['browser','account'].includes(data.mode):data.mode!=='account')throw Error('unavailable');
      window.location.reload();
    }catch(e){const reason=e instanceof Error?e.message:'';setError(reason==='conflict'?(zh?'账号或工作区已连接到其他身份。现有资料保留，请恢复已连接空间或换用原账号。':'This account or workspace is already connected elsewhere. Saved data is preserved. Restore the connected workspace or use the original account.'):reason==='signin'?(zh?'请先登录 ChatGPT，再完成连接。':'Sign in with ChatGPT first.'):reason==='missing'?(zh?'这个账号还没有连接工作区。请先在原浏览器中连接。':'This account has no connected workspace. Connect from the original browser first.'):(zh?'操作暂未确认，现有资料保留。请重试或重新载入核对。':'The operation could not be confirmed. Saved data is preserved. Retry or reload to check.'));setBusy(false)}
  };
  return <section className="pi-workspace-access" aria-label={zh?'访问与恢复':'Access & recovery'}>
    <h3>{zh?'访问与恢复':'Access & recovery'}</h3>
    <p>{demo?(zh?'演示空间不连接账号。':'Demo workspaces do not connect to accounts.'):session?.mode==='locked'?(zh?'请登录连接此工作区的 ChatGPT 账号，继续访问已保存的资料。':'Sign in with the ChatGPT account connected to this workspace to access saved materials.'):session?.mode==='account'?(zh?'已连接 ChatGPT。换设备或清除浏览器数据后，登录同一账号即可恢复这些空间。':'Connected to ChatGPT. Sign in with the same account on another device or after clearing browser data to recover these spaces.'):(zh?'目前通过此浏览器访问。连接 ChatGPT 后，可以在其他设备恢复现有空间、文献和笔记。':'Access currently belongs to this browser. Connect ChatGPT to recover existing spaces, papers and notes on other devices.')}</p>
    {session?.accountLabel&&<p className="pi-access-account">{session.accountLabel}</p>}
    {session?.differentWorkspace&&<p>{zh?'这个账号连接了另一个工作区。当前浏览器的空间保持原样，恢复时只切换访问，不合并资料。':'This account is connected to a different workspace. Current browser spaces stay intact; recovery switches access without merging data.'}</p>}
    {!demo&&<div className="pi-access-actions">{(!session?.signedIn||session.mode==='locked')?<a href="/signin-with-chatgpt?return_to=%2F%3Fworkspace-access%3D1" target="_top">{zh?'登录 ChatGPT，连接或恢复':'Sign in to connect or recover'}</a>:!session.accountAvailable?<p role="status">{zh?'账号连接服务暂不可用，当前浏览器访问保留。':'Account connection is unavailable; browser access is preserved.'}</p>:<>{session.mode!=='account'&&!session.differentWorkspace&&<button type="button" disabled={busy} onClick={()=>{setConfirm('connect');setError('')}}>{zh?'连接当前工作区':'Connect this workspace'}</button>}{session.linked&&session.mode!=='account'&&<button type="button" disabled={busy} onClick={()=>{setConfirm('restore');setError('')}}>{zh?'恢复已连接的工作区':'Restore connected workspace'}</button>}</>}</div>}
    {!demo&&session?.signedIn&&<a className="pi-welcome-demo" href="/signout-with-chatgpt?return_to=%2F%3Fworkspace-access%3D1" target="_top">{zh?'退出 ChatGPT 账号':'Sign out of ChatGPT'}</a>}
    {!demo&&session?.canReturnToBrowser&&<div className="pi-access-actions"><button type="button" disabled={busy} onClick={()=>{setConfirm('browser');setError('')}}>{zh?'返回本浏览器原工作区':'Return to original browser workspace'}</button></div>}
    {confirm&&<div className="pi-access-confirm"><p>{confirm==='browser'?(zh?'返回本浏览器原来的工作区，账号连接仍然保留。请先保存正在编辑的内容。':'Return to the original browser workspace without removing the account connection. Save ongoing edits first.'):confirm==='connect'?(zh?'连接当前浏览器下的全部研究空间。原空间、文献和笔记保留，不重建或转移。':'Connect all research spaces in this browser. Existing spaces, papers and notes remain in place.'):(zh?'切换到该账号已连接的工作区。当前工作区资料保留；请先保存正在编辑的内容。':'Switch to this account’s connected workspace. Current workspace data remains intact; save ongoing edits first.')}</p><div><button type="button" disabled={busy} onClick={()=>void change()}>{busy?(zh?'正在核对…':'Checking…'):confirm==='connect'?(zh?'确认连接':'Confirm connection'):confirm==='browser'?(zh?'确认返回':'Confirm return'):(zh?'确认恢复并切换':'Restore & switch')}</button><button type="button" disabled={busy} onClick={()=>setConfirm(null)}>{zh?'取消':'Cancel'}</button></div></div>}
    {error&&<p role="alert">{error}</p>}
    <p className="pi-access-note">{zh?'连接用于找回访问身份。模型 Key 和未保存草稿不随账号恢复；文献笔记备份可在论文库导出。尚未连接且浏览器身份已清除时，无法仅凭空间链接找回。':'Connection recovers workspace access. Model keys and unsaved drafts do not transfer. Export paper and note backups from the library. Without a connection or browser identity, a space link alone cannot restore access.'}</p>
  </section>;
}
