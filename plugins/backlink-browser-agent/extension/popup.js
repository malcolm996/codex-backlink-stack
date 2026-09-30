const status = document.querySelector('#status');
chrome.runtime.sendMessage({ type: 'BBA_STATUS' }, function(value) {
  status.textContent = value ? (value.quietMode ? '静默模式' : '可见模式') + ' · 运行中任务 ' + value.activeTasks : '后台服务未响应';
});
document.querySelector('#poll').addEventListener('click', function() {
  chrome.runtime.sendMessage({ type: 'BBA_POLL_NOW' }, function() { window.close(); });
});
document.querySelector('#options').addEventListener('click', function() { chrome.runtime.openOptionsPage(); });

