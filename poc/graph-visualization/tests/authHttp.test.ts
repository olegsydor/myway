import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, onAuthInvalid, request, setIdentity } from '../src/auth/http.ts';

test('requests carry session-bound CSRF even on reads and preserve domain errors', async () => {
  const original = globalThis.fetch;
  setIdentity(1, 'session-a');
  const invalid: string[]=[];
  onAuthInvalid(error => invalid.push(error.code));
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(new Headers(init?.headers).get('x-csrf-token'),'session-a');
      assert.equal(init?.credentials,'same-origin');
      return new Response(JSON.stringify({ detail:'Snapshot conflict' }), { status:409 });
    };
    await assert.rejects(request('/api/layouts'),error => error instanceof ApiError && error.status===409);
    assert.deepEqual(invalid,[]);
    globalThis.fetch = async () => new Response(JSON.stringify({detail:'csrf_failed'}),{status:403});
    await assert.rejects(request('/api/graph'),/csrf_failed/);
    assert.deepEqual(invalid,['csrf_failed']);
  } finally { globalThis.fetch=original;onAuthInvalid(null);setIdentity(null,null); }
});

test('account changes abort old requests and reject late responses, including 401', async () => {
  const original=globalThis.fetch;
  let resolve!: (response: Response)=>void;
  let signal: AbortSignal | null | undefined;
  let invalid=0;
  setIdentity(1,'a');onAuthInvalid(()=>invalid++);
  try {
    globalThis.fetch=async (_url, init)=>{ signal=init?.signal;return new Promise<Response>(done=>resolve=done); };
    const pending=request('/api/graph');
    setIdentity(2,'b');
    assert.equal(signal?.aborted,true);
    resolve(new Response(JSON.stringify({detail:'session_expired'}),{status:401}));
    await assert.rejects(pending,/Account changed/);
    assert.equal(invalid,0);
  } finally { globalThis.fetch=original;onAuthInvalid(null);setIdentity(null,null); }
});

test('caller cancellation propagates to the composed signal', async () => {
  const original=globalThis.fetch;
  const caller=new AbortController();
  let signal: AbortSignal | null | undefined;
  let resolve!: (response:Response)=>void;
  try {
    globalThis.fetch=async (_url,init)=>{signal=init?.signal;return new Promise<Response>(done=>resolve=done);};
    const pending=request('/api/graph',{signal:caller.signal});
    caller.abort();assert.equal(signal?.aborted,true);
    resolve(new Response('{}'));await pending;
  } finally { globalThis.fetch=original; }
});
