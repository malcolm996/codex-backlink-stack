const version = await fetch('http://127.0.0.1:9223/json/version').then(function(response) { return response.json(); });
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise(function(resolve, reject) {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
await new Promise(function(resolve) { setTimeout(resolve, 300); });
socket.close();
