/** Authored intent scenarios, not human-labeled paper relevance judgments. */
export const MEMORY_EVAL_CASES = ['mathematics','information'].map(domain => ({
 id:domain, asOf:'2026-09-20T00:00:00Z',
 signals:[
  {id:'method',layer:'explicit',kind:'method',reasonCode:'method_fit',labelEn:domain==='mathematics'?'Stochastic localization':'Finite blocklength',expected:'interest'},
  {id:'scope',layer:'explicit',kind:'exclusion',reasonCode:'topic_drift',labelEn:'Outside the chosen research scope',expected:'scope'},
  {id:'quality',layer:'explicit',kind:'exclusion',reasonCode:'weak_evidence',labelEn:'Insufficient evidence in one paper',expected:'quality'},
  {id:'depth',layer:'explicit',kind:'exclusion',reasonCode:'too_shallow',labelEn:'Seek deeper treatment',expected:'depth'},
  {id:'known',layer:'explicit',kind:'mastery',reasonCode:'duplicate_known',labelEn:'Already know this introductory work',expected:'mastery'},
  {id:'type',layer:'explicit',kind:'exclusion',reasonCode:'wrong_type',labelEn:'Need research articles',expected:'format'},
  {id:'paper',layer:'explicit',kind:'exclusion',reasonCode:'network_dismissed',labelEn:'Dismissed this paper',expected:'paper'},
  {id:'behavior',layer:'inferred',kind:'behavior_interest',labelEn:'Repeated reading is tentative interest',expected:'interest'},
  {id:'unsafe-exclusion',layer:'inferred',kind:'exclusion',labelEn:'Inferred dislike must not become a scope boundary',expected:null},
  {id:'disabled',layer:'inferred',kind:'method',labelEn:'Disabled inference',active:false,expected:null},
  {id:'expired',layer:'inferred',kind:'method',labelEn:'Expired inference',expiresAt:'2026-09-01T00:00:00Z',expected:null},
 ],
}));
