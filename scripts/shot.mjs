// Drive headless Chrome over the DevTools Protocol for screenshots and checks.
// Usage: node scripts/shot.mjs <url> <out.png> [waitMs] [js-expression ...]
// Each js-expression is evaluated in the page (after the wait) and its result printed.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out, waitArg, ...exprs] = process.argv.slice(2);
const wait = Number(waitArg ?? 5000);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const width = Number(process.env.WIDTH ?? 1280);
const height = Number(process.env.HEIGHT ?? 1100);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--window-size=${width},${height}`, '--user-data-dir=/tmp/shot-profile', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      return await res.json();
    } catch {
      await sleep(100);
    }
  }
  throw new Error('chrome did not start');
}

const page = (await targets()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    console.log('console.error:', m.params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (m.method === 'Runtime.exceptionThrown') {
    console.log('exception:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
await send('Page.navigate', { url });
await sleep(wait);
for (const expr of exprs) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const ex = r.result?.exceptionDetails;
  const shown = ex ? `EXCEPTION ${ex.exception?.description ?? ex.text}` : JSON.stringify(r.result?.result?.value);
  console.log(`${expr}\n  => ${shown}`);
}
if (out && out !== '-') {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`wrote ${out}`);
}
ws.close();
chrome.kill();
