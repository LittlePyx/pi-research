// The server's unique claims are authoritative: a failed result is terminal too.
export async function continuePilot({cases,experimentHash,sourceCommit,executionSourceCommit,token,fetchImpl=fetch,onRecord=()=>{},onProgress=()=>{}}) {
 const records=[];
 for(const task of cases)for(const variant of task.order) {
  onProgress(task,variant,records.length+1);
  const response=await fetchImpl('/api/personalization-pilot',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({caseId:task.id,variant,sourceCommit,executionSourceCommit}),signal:AbortSignal.timeout(75_000)});
  if(!response.ok||!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('执行中断（HTTP '+response.status+'）。已有记录保留，不自动重试。');
  const data=await response.json(),row=data.record;
  if(!row||row.caseId!==task.id||row.variant!==variant||row.sourceCommit!==sourceCommit||row.experimentHash!==experimentHash||!['completed','failed'].includes(row.status)||typeof data.cached!=='boolean')throw new Error('结果身份或状态不一致，已停止。');
  if(!data.cached&&row.executionSourceCommit!==executionSourceCommit)throw new Error('本次执行版本不一致，已停止。');
  records.push(row);onRecord(row,data.cached,[...records]);
  // Past failures are skipped, never re-executed. A new validation failure does
  // not prevent independent, unattempted cases; provider/transport failures halt.
  if(!data.cached&&row.status==='failed'&&!row.validationFailure)throw new Error('服务端调用失败：'+(row.errorCode||'unknown')+'。已停止并保留记录，不自动重试。');
 }
 return records;
}
