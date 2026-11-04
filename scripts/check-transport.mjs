import assert from 'node:assert/strict';
import {retryDiagnosis} from '../companion/transport.mjs';
const cases=[
 [{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:400}}},'request'],
 [{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:503}}},'server'],
 [{codexErrorInfo:'serverOverloaded'},'server'],
 [{codexErrorInfo:{responseStreamConnectionFailed:{httpStatusCode:429}}},'rate-limit'],
 [{codexErrorInfo:'usageLimitExceeded'},'rate-limit'],
 [{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:401}}},'auth'],
 [{codexErrorInfo:'unauthorized'},'auth'],
 [{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:null}}},'connection'],
 [{codexErrorInfo:{responseStreamDisconnected:{httpStatusCode:null}}},'stream'],
 [{message:'stream idle timeout'},'timeout'],
 [{message:'Codex is retrying'},'unknown'],
 [{codexErrorInfo:{futureVariant:{httpStatusCode:'503'}}},'unknown']
];
for(const [error,reason] of cases)assert.equal(retryDiagnosis(error).reason,reason);
const secret={message:'https://proxy.invalid?token=PRIVATE_TOKEN Bearer hidden-secret C:\\Users\\private-name',additionalDetails:'PRIVATE_DETAILS'};
const publicInfo=JSON.stringify(retryDiagnosis(secret));
assert(!/PRIVATE|proxy.invalid|hidden-secret|private-name/.test(publicInfo));
console.log('PASS: retries distinguish service, rate-limit, auth, connection, stream, timeout and unknown errors; raw diagnostics never enter reading history.');
