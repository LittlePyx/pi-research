// Shared by queue selection and the read-only status projection. Keep eligibility identical.
export const pendingQualityCandidateCondition = `(i.analysis_model = ''
       OR (i.analysis_source = 'deepseek_rejected' AND instr(i.screening_reason, 'Abstract evidence unavailable after bounded enrichment') > 0
         AND NOT EXISTS (SELECT 1 FROM paper_abstract_recovery ar WHERE ar.paper_id=p.id AND (ar.retry_at > unixepoch()*1000 OR ar.lease_until > unixepoch()*1000)))
       OR i.analysis_source = 'deepseek_screened'
       OR i.analysis_source = 'deepseek_verification_pending'
       OR (i.analysis_source = 'deepseek_rejected' AND i.verification_status = 'degraded'
         AND (lower(i.screening_reason) LIKE '%timeout%' OR lower(i.screening_reason) LIKE '%aborted%'
           OR lower(i.screening_reason) LIKE '%temporarily unavailable%'))
       OR (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) < datetime('now', '-90 days'))
       OR (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) < datetime(?)
         AND i.llm_relevance_score >= 45 AND i.quality_score >= 48)
       OR (i.analysis_source = 'deepseek_rejected' AND datetime(i.updated_at) < datetime(?) AND (
         (i.llm_relevance_score <= 1 AND (
           lower(i.screening_reason) LIKE '%directly relevant%' OR lower(i.screening_reason) LIKE '%direct fit%'
           OR lower(i.screening_reason) LIKE '%moderate relevance%' OR lower(i.screening_reason) LIKE '%directly addresses%'
           OR i.screening_reason LIKE '%直接相关%' OR i.screening_reason LIKE '%高度相关%'
         ))
         OR (length(trim(i.abstract_text)) = 0 AND lower(i.screening_reason) LIKE '%abstract missing%')
       )))`;

export const missingAbstractCondition = `(i.analysis_source = 'deepseek_rejected'
 AND instr(i.screening_reason, 'Abstract evidence unavailable after bounded enrichment') > 0)`;

export function qualityQueueCountsSql(activeRoutePredicate) {
  return `WITH candidates AS (
    SELECT i.analysis_source, i.verification_status, i.screening_reason,
     CASE WHEN ${pendingQualityCandidateCondition} THEN 1 ELSE 0 END AS eligible,
     CASE WHEN ${missingAbstractCondition} THEN 1 ELSE 0 END AS needs_abstract,
     MAX(COALESCE(ar.retry_at, 0), COALESCE(ar.lease_until, 0)) AS abstract_retry_at
    FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
    LEFT JOIN paper_abstract_recovery ar ON ar.paper_id = p.id
    WHERE p.space_id = ? AND COALESCE(i.ever_recommended, 0) = 0
     AND NOT EXISTS (SELECT 1 FROM paper_feedback suppressed
       WHERE suppressed.space_id = p.space_id AND suppressed.paper_id = p.id
        AND suppressed.feedback = 'not_relevant')
     AND ${activeRoutePredicate}
  ) SELECT COALESCE(SUM(eligible), 0) AS pendingCount,
   COALESCE(SUM(eligible = 1 AND analysis_source = 'deepseek_verification_pending'), 0) AS verificationCount,
   COALESCE(SUM(eligible = 1 AND analysis_source = 'deepseek_rejected' AND verification_status = 'degraded' AND needs_abstract = 0
     AND (lower(screening_reason) LIKE '%timeout%' OR lower(screening_reason) LIKE '%aborted%'
       OR lower(screening_reason) LIKE '%temporarily unavailable%')), 0) AS retryCount,
   COALESCE(SUM(needs_abstract = 1 AND eligible = 0), 0) AS awaitingAbstractCount,
   MIN(CASE WHEN needs_abstract = 1 AND eligible = 0 THEN abstract_retry_at END) AS abstractRetryAt
   FROM candidates`;
}

export function qualityAbstractDetailsSql(activeRoutePredicate) {
  return `SELECT p.id, p.title, COALESCE(ar.status, 'unknown') AS status,
    COALESCE(ar.attempted_json, '[]') AS attempted_json,
    MAX(COALESCE(ar.retry_at, 0), COALESCE(ar.lease_until, 0)) AS retry_at,
    ar.updated_at
    FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
    LEFT JOIN paper_abstract_recovery ar ON ar.paper_id=p.id AND ar.space_id=p.space_id
    WHERE p.space_id=? AND COALESCE(i.ever_recommended,0)=0
      AND ${missingAbstractCondition} AND NOT ${pendingQualityCandidateCondition}
      AND NOT EXISTS (SELECT 1 FROM paper_feedback f WHERE f.space_id=p.space_id AND f.paper_id=p.id AND f.feedback='not_relevant')
      AND ${activeRoutePredicate}
    ORDER BY retry_at, p.id LIMIT 20`;
}
