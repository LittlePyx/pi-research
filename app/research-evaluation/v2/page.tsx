import type {Metadata} from 'next';
import PilotConsole from '../pilot-console';
import experiment from '../../../benchmarks/personalization/protocol-v2.json';
import {V2_CONSOLE_OPEN} from '../../../lib/personalization-v2-access';
export const metadata:Metadata={title:'Pi Research · 第二版验证',robots:{index:false,follow:false}};
export default function EvaluationPageV2() {
 return <PilotConsole enabled={V2_CONSOLE_OPEN} sourceCommit="" secondVersion endpoint="/api/personalization-pilot-v2" experimentHash={experiment.experimentHash} cases={experiment.cases.map(c=>({id:c.id,goal:`${c.goalZh}（第 ${c.repetition} 次）`,order:c.order}))}/>;
}
