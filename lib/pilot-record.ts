/** Saved experimental runs; a failed record is terminal and is never re-executed. */
export type PilotRunRecord = {
  caseId:string; variant:string; sourceCommit:string; executionSourceCommit?:string;
  experimentHash:string; status:string; inputTokens:number|null; outputTokens:number|null; durationMs:number|null;
  errorCode?:string; validationFailure?:boolean; recommendations?:{id:string;reason:string;quote:string}[];
};
