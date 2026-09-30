import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Provide one or more capture files');

function arrayStats(value, currentPath = '$', depth = 0, output = []) {
  if (depth > 6 || value == null) return output;
  if (Array.isArray(value)) {
    output.push({
      path: currentPath,
      length: value.length,
      firstItemKeys: value[0] && typeof value[0] === 'object' && !Array.isArray(value[0]) ? Object.keys(value[0]).slice(0, 40) : []
    });
    if (value.length) arrayStats(value[0], currentPath + '[0]', depth + 1, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) arrayStats(item, currentPath + '.' + key, depth + 1, output);
  }
  return output;
}

for (const file of files) {
  const capture = JSON.parse(fs.readFileSync(file, 'utf8'));
  const responses = capture.responses.map(function(item) {
    const stats = item.json === undefined ? [] : arrayStats(item.json);
    return {
      url: item.url,
      status: item.status,
      mimeType: item.mimeType,
      bodyLength: item.bodyLength,
      topKeys: item.json && typeof item.json === 'object' && !Array.isArray(item.json) ? Object.keys(item.json) : [],
      arrays: stats.filter(function(entry) { return entry.length > 0; }).slice(0, 20),
      textPreview: item.textPreview
    };
  }).filter(function(item) { return item.bodyLength > 200 || item.arrays.length > 0; });
  console.log(JSON.stringify({ file: file, page: capture.page, responses: responses }, null, 2));
}
