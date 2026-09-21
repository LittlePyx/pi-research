import type {Metadata} from 'next';
import PilotConsole from './pilot-console';
import candidates from '../../benchmarks/personalization/candidates.json';
import {PILOT_SCENARIOS} from '../../benchmarks/personalization/scenarios.mjs';
import {freezePilot} from '../../lib/personalization-pilot.mjs';
import {PILOT_CONSOLE_OPEN,PILOT_BASELINE_COMMIT} from '../../lib/personalization-pilot-access';

export const metadata: Metadata = {title:'Pi Research · 推荐对比实验',robots:{index:false,follow:false}};
export default function EvaluationPage() {
 const experiment=freezePilot(PILOT_SCENARIOS,candidates.papers);
 return <PilotConsole enabled={PILOT_CONSOLE_OPEN} sourceCommit={PILOT_BASELINE_COMMIT} experimentHash={experiment.experimentHash} cases={experiment.cases.map(c=>({id:c.id,goal:c.goalZh,order:c.order}))}/>;
}
