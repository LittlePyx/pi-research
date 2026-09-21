import type {Metadata} from "next";
import AgentProcess from "./process";
export const metadata: Metadata = {title:"Pi Research · 研究过程",description:"查看研究行为如何指导发现，以及可追溯的历史运行与验证边界。"};
export default async function ProcessPage({searchParams}:{searchParams:Promise<{space?:string;view?:string}>}) {
 const params=await searchParams;
 return <AgentProcess initialSpace={params.space==="demo-information"?"demo-information":"demo-mathematics"} initialView={params.view==='pilot'?'pilot':'journey'} />;
}
