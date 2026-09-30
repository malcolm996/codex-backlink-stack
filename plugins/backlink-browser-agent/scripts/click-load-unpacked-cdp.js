const targets = await fetch('http://127.0.0.1:9223/json/list').then(function(response) { return response.json(); });
const target = targets.find(function(item) { return item.url === 'chrome://extensions/'; });
if (!target) throw new Error('chrome://extensions target not found');
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
const rectResult = await command('Runtime.evaluate', {
  expression: "(function(){const root=document.querySelector('extensions-manager').shadowRoot.querySelector('#toolbar').shadowRoot;const toggle=root.querySelector('#devMode');if(toggle.getAttribute('aria-pressed')!=='true')toggle.click();const rect=root.querySelector('#loadUnpacked').getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()",
  returnByValue: true
});
const point = rectResult.result.value;
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
console.log(JSON.stringify({ clicked: point }));
socket.close();

