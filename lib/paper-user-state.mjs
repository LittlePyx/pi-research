/** User decisions and reading progress are independent of the model's recommendation stage. */
export function paperUserStateView(paper,now=Date.now()) {
 if(paper.feedback==='not_relevant')return 'dismissed';
 if(paper.saved||paper.feedback==='relevant'||['queued','reading','read','mastered','cited'].includes(paper.readingStatus))return 'accepted';
 if(paper.snoozedUntil&&Date.parse(paper.snoozedUntil)>now)return 'snoozed';
 if(paper.openedAt||paper.showCount>0)return 'seen';
 return 'unseen';
}
