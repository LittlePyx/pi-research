import {getDatabase,getRuntimeEnv} from '../../../db/repository';
import candidates from '../../../benchmarks/personalization/candidates.json';
import {PILOT_SCENARIOS} from '../../../benchmarks/personalization/scenarios.mjs';
import {freezePilot} from '../../../lib/personalization-pilot.mjs';
import {handleServerPilot} from '../../../lib/server-personalization-pilot.mjs';
import {PILOT_ACCESS_HASH,PILOT_EXPIRES_AT} from '../../../lib/personalization-pilot-access';

const experiment=freezePilot(PILOT_SCENARIOS,candidates.papers);
export async function POST(request:Request) {
 return handleServerPilot(request,{database:getDatabase(),apiKey:getRuntimeEnv().DEEPSEEK_API_KEY||'',experiment,accessHash:PILOT_ACCESS_HASH,expiresAt:PILOT_EXPIRES_AT});
}
