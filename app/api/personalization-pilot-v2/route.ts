import {getDatabase,getRuntimeEnv} from '../../../db/repository';
import experiment from '../../../benchmarks/personalization/protocol-v2.json';
import {executePilotRunV2} from '../../../lib/personalization-pilot-v2.mjs';
import {handleServerPilot} from '../../../lib/server-personalization-pilot.mjs';
import {V2_ACCESS_HASH,V2_EXPIRES_AT} from '../../../lib/personalization-v2-access';
export async function POST(request:Request) {
 return handleServerPilot(request,{database:getDatabase(),apiKey:getRuntimeEnv().DEEPSEEK_API_KEY||'',experiment,accessHash:V2_ACCESS_HASH,expiresAt:V2_EXPIRES_AT,executeRun:executePilotRunV2});
}
