import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const executable = resolve(process.argv[2] || "dist\\quiz\\Quiz-Builder-1.0.0-win-x64.exe");
const weatherApp = process.argv[3] === "weather";
const JSZip = weatherApp ? null : createRequire(require.resolve("mammoth"))("jszip");
const profile = await mkdtemp(join(tmpdir(), "daylight-smoke-"));
const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
  stdio: ["ignore", "pipe", "pipe"],
  env: environment
});
let output = "";
child.stdout.on("data", data => { output += data; });
child.stderr.on("data", data => { output += data; });
let launchError;
child.on("error", error => { launchError = error; });
let socket;
let sequence = 0;
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Timed out: " + method)); }, 30000);
    pending.set(id, {
      method,
      resolve: result => { clearTimeout(timer); resolve(result); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error("Page did not become ready: " + expression);
}
try {
  let page;
  for (let i = 0; i < 300; i++) {
    if (launchError) throw launchError;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      page = (await response.json()).find(target => target.type === "page");
      if (page) break;
    } catch (error) {
      if (i === 299) throw error;
    }
    await sleep(100);
  }
  assert.ok(page, "Desktop window must expose a page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const [id, request] of pending) {
      if (request.method === "Browser.close") request.resolve({});
      else request.reject(new Error("Desktop debugger disconnected"));
      pending.delete(id);
    }
  });
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Network.setBlockedURLs", { urls: ["http://*", "https://*"] });
  await waitFor("document.readyState === 'complete' && document.querySelector('.masthead') !== null");
  assert.equal(await evaluate("typeof window.require + ':' + typeof window.process"), "undefined:undefined");
  assert.equal(await evaluate("document.querySelector('.app-nav')"), null);
  const unavailablePage = weatherApp ? "quiz.html" : "index.html";
  assert.equal(await evaluate(`fetch('daylight://app/${unavailablePage}').then(r=>r.status)`), 404);
  if (weatherApp) {
    assert.equal(await evaluate("location.href"), "daylight://app/index.html");
    assert.equal(await evaluate("document.title"), "Daylight Weather");
    await waitFor("document.getElementById('refresh')?.disabled === false");
    await evaluate("document.getElementById('refresh').click()");
    await waitFor("document.getElementById('status')?.dataset.state === 'fallback'");
    assert.match(await evaluate("document.getElementById('status-text').textContent"), /Sample weather/);
    await command("Network.setBlockedURLs", { urls: [] });
    await evaluate("document.getElementById('refresh').click()");
    await waitFor("document.getElementById('status')?.dataset.state !== 'loading'");
    const weatherState = await evaluate("document.getElementById('status').dataset.state");
    await evaluate("document.querySelector('[data-unit=\"f\"]').click()");
    assert.equal(await evaluate("document.querySelector('[data-unit=\"f\"]').getAttribute('aria-pressed')"), "true");
    assert.equal(await evaluate("document.querySelectorAll('.day').length"), 5);
    await evaluate("document.querySelectorAll('.day')[2].click()");
    assert.equal(await evaluate("document.querySelectorAll('.day')[2].getAttribute('aria-pressed')"), "true");
    assert.equal(await evaluate("document.querySelector('a[href=\"quiz.html\"]')"), null);
    console.log(`PASS: ${executable}\nStandalone weather launch, sandbox, no quiz links/resources, forecast, units, offline fallback, online refresh (${weatherState}).`);
  } else {
  await waitFor("document.getElementById('sample') !== null");
  assert.equal(await evaluate("location.href"), "daylight://app/quiz.html");
  assert.equal(await evaluate("document.title"), "Quiz Builder");
  assert.equal(await evaluate("document.querySelector('a[href=\"index.html\"]')"), null);
  assert.equal(await evaluate("document.querySelector('.brand-mark')"), null);
  await waitFor("document.getElementById('sample').click(), document.getElementById('source').value.length > 0");
  await evaluate("document.getElementById('generate').click()");
  assert.equal(await evaluate("document.querySelectorAll('.question').length"), 6);
  const scores = await evaluate(`(() => {
    document.getElementById('answer-0').value = 'Kathmandu';
    document.getElementById('answer-1').value = 'the planet Mars';
    document.getElementById('quiz-form').requestSubmit();
    const automatic = document.getElementById('score').textContent;
    document.querySelector('.self-mark input').click();
    const adjusted = document.getElementById('score').textContent;
    document.getElementById('retry').click();
    return {automatic, adjusted, reset: document.getElementById('answer-0').value};
  })()`);
  assert.match(scores.automatic, /^1 \/ 6/);
  assert.match(scores.adjusted, /^2 \/ 6.*1 self-marked/);
  assert.equal(scores.reset, "");

  await evaluate(`window.testUpload = async (name, bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name));
    const input = document.getElementById('document');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    for (let i=0; i<200 && document.getElementById('generate').disabled; i++) await new Promise(r=>setTimeout(r,50));
    return {status:document.getElementById('file-status').textContent, text:document.getElementById('source').value};
  }`);
  const text = await evaluate("testUpload('notes.txt', 'Q: Capital of Nepal?\\nA: Kathmandu')");
  assert.match(text.status, /^Loaded/);
  const invalid = await evaluate("testUpload('unsupported.doc', 'invalid')");
  assert.match(invalid.status, /Unsupported/);
  assert.equal(invalid.text, text.text);
  const oversized = await evaluate("testUpload('large.txt', new Uint8Array(5*1024*1024+1))");
  assert.match(oversized.status, /exceeds 5 MB/);

  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Q: Capital of Nepal?</w:t></w:r></w:p><w:p><w:r><w:t>A: Kathmandu</w:t></w:r></w:p></w:body></w:document>');
  const docx = await zip.generateAsync({ type: "base64" });
  const extracted = await evaluate(`testUpload('notes.docx', Uint8Array.from(atob(${JSON.stringify(docx)}), c=>c.charCodeAt(0)))`);
  assert.match(extracted.status, /^Loaded/);
  assert.match(extracted.text, /Kathmandu/);

  const stream = "BT /F1 14 Tf 50 750 Td (Q: Capital of Nepal?) Tj 0 -25 Td (A: Kathmandu) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n" + offsets.map(n => String(n).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const pdfResult = await evaluate(`testUpload('notes.pdf', ${JSON.stringify(pdf)})`);
  assert.match(pdfResult.status, /^Loaded/);
  assert.match(pdfResult.text, /Kathmandu/);
  await evaluate("document.getElementById('generate').click()");
  assert.equal(await evaluate("document.querySelectorAll('.question').length"), 1);
  await command("Page.navigate", { url: "daylight://app/quiz.html" });
  await waitFor("document.getElementById('source') !== null");
  assert.equal(await evaluate("document.getElementById('source').value"), "");
  console.log(`PASS: ${executable}\nStandalone quiz launch, sandbox, no weather links/resources, offline quiz, scoring, retake, TXT/DOCX/PDF parsing, upload errors, and reload reset.`);
  }
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await command("Browser.close"); }
    catch (error) { console.error("Could not close desktop through debugger:", error.message); }
    socket.close();
  }
  await sleep(1500);
  if (child.exitCode === null) child.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
