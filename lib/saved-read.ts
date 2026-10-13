import {workspaceFetch} from './workspace-request';

export type SavedReadFailure = 'timeout' | 'unavailable' | 'access' | 'missing' | 'invalid' | 'cancelled';
export class SavedReadError extends Error {
  constructor(public kind:SavedReadFailure){super(kind);this.name='SavedReadError'}
}
/** Saved-data reads have a deadline even when a transport ignores AbortSignal. */
export async function readSavedJson<T>(url:string,decode:(value:unknown)=>T,signal:AbortSignal):Promise<T>{
  if(signal.aborted)throw new SavedReadError('cancelled');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout> | undefined;
  let cancel=()=>{};
  const stopped=new Promise<never>((_,reject)=>{
    cancel=()=>{controller.abort();reject(new SavedReadError('cancelled'))};
    signal.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>{controller.abort();reject(new SavedReadError('timeout'))},20000);
  });
  try{
    const work=(async()=>{
      const response=await workspaceFetch(url,{method:'GET',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new SavedReadError([401,403].includes(response.status)?'access':[404,410].includes(response.status)?'missing':'unavailable');
      let value:unknown;try{value=await response.json()}catch{throw new SavedReadError('invalid')}
      return decode(value);
    })();
    return await Promise.race([work,stopped]);
  }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel)}
}
export function savedReadFailure(error:unknown):SavedReadFailure{return error instanceof SavedReadError?error.kind:'unavailable'}
