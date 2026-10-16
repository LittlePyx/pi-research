export type ComparisonEligibility = 'eligible' | 'not_found' | 'excluded' | 'not_recommended' | 'unverified' | 'missing_abstract' | 'unavailable';
export type ComparisonMaterial = {
  canonicalId: string; paperId: string | null; eligibility: ComparisonEligibility;
  readingStatus: string; whyReadZh: string; whyReadEn: string;
};
export function comparisonEligibility(paper: {recommended:number;verified:number;abstractText:string;excluded?:number}|null):ComparisonEligibility {
  if(!paper)return 'not_found';
  if(paper.excluded)return 'excluded';
  if(!paper.recommended)return 'not_recommended';
  if(!paper.verified)return 'unverified';
  if(paper.abstractText.trim().length<80)return 'missing_abstract';
  return 'eligible';
}
export function comparisonEligibilityText(state:ComparisonEligibility|undefined,zh:boolean) {
  const labels={eligible:['可比较 · 摘要已核验','Eligible · abstract verified'],not_found:['尚未取得可用摘要','No usable abstract record'],excluded:['已标记不相关','Marked not relevant'],not_recommended:['尚未通过推荐评审','Recommendation review not passed'],unverified:['摘要解读待核验','Abstract analysis needs verification'],missing_abstract:['摘要不足，待补全','Abstract needs more evidence'],unavailable:['暂不在可比较材料中','Not currently available for comparison']};
  return state?labels[state][zh?0:1]:zh?'正在核对可比较状态':'Checking comparison eligibility';
}
