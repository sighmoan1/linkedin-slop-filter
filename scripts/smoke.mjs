import {DEFAULTS, requestFor, probability} from '../core.mjs';

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error('Missing prerequisite: OPENROUTER_API_KEY. Set it locally; never paste keys into chat or commit them.');
  process.exit(2);
}
const req = requestFor({...DEFAULTS, jevKey:key}, 'Synthetic test: Our database migration reduced query time from 240 ms to 38 ms by adding a composite index.');
try {
  const response = await fetch(req.url, {
    method:'POST', headers:{Authorization:'Bearer '+req.key,'Content-Type':'application/json'},
    body:JSON.stringify(req.body), redirect:'error', signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Jev HTTP '+response.status);
  console.log(JSON.stringify({provider:'jev',probability:probability('jev',await response.json()),synthetic:true}));
} catch (error) {
  console.error(error.name === 'TimeoutError' ? 'Jev timed out.' : 'Jev smoke test failed: '+(error.message.startsWith('Jev HTTP') ? error.message : 'network error or invalid response'));
  process.exit(1);
}
