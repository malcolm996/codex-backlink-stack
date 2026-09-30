const targetNeedle = process.argv[2];
const expression = process.argv.slice(3).join(' ');
if (!targetNeedle || !expression) {
  console.error('Usage: node scripts/cdp-eval.js <target-url-part> <expression>');
  process.exit(2);
}

const targets = await fetch('http://127.0.0.1:9223/json/list').then(function(response) { return response.json(); });
const target = targets.find(function(item) {
  return item.url.includes(targetNeedle) || item.type === targetNeedle || item.id === targetNeedle || item.title.includes(targetNeedle);
});
if (!target) {
  console.error('Target not found: ' + targetNeedle);
  process.exit(3);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
socket.addEventListener('message', function(event) {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message)); else handlers.resolve(message.result);
});
await new Promise(function(resolve, reject) {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
function command(method, params) {
  return new Promise(function(resolve, reject) {
    id += 1;
    pending.set(id, { resolve: resolve, reject: reject });
    socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
}
const result = await command('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify({ target: { type: target.type, title: target.title, url: target.url }, result: result.result && result.result.value, exception: result.exceptionDetails || null }, null, 2));
socket.close();
