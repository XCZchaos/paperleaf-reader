// Poll only one request at a time. Fast delivery during output, lighter traffic
// while the model is thinking/retrying or the reader's window is hidden.
export function streamPollDelay(job, changed, hidden = false) {
 if (hidden) return 1200;
 if (job.retrying) return 1000;
 return changed && (job.text || job.reasoningSummary || job.activity) ? 220 : 550;
}
export function streamJobChanged(a, b) {
 return !a || ['id','status','stage','updated','text','error','reasoningSummary','activity','retryCount','retrying'].some(key=>a[key]!==b[key]) || (a.events?.length||0)!==(b.events?.length||0);
}
