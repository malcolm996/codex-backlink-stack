import fs from 'node:fs';

const file = process.argv[2];
const pattern = new RegExp(process.argv[3] || '.*', 'i');
const urlPattern = new RegExp(process.argv[4] || '.*', 'i');
if (!file) throw new Error('Capture file is required');
const capture = JSON.parse(fs.readFileSync(file, 'utf8'));

function walk(value, currentPath = '$', depth = 0, found = []) {
  if (depth > 12 || value == null) return found;
  if (Array.isArray(value)) {
    if (value.length) found.push({ path: currentPath, type: 'array', length: value.length, firstItemKeys: value[0] && typeof value[0] === 'object' ? Object.keys(value[0]).slice(0, 60) : [] });
    if (value.length) walk(value[0], currentPath + '[0]', depth + 1, found);
    return found;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const nextPath = currentPath + '.' + key;
      if (pattern.test(key)) {
        found.push({ path: nextPath, type: Array.isArray(item) ? 'array' : typeof item, value: typeof item === 'object' ? undefined : item, length: Array.isArray(item) ? item.length : undefined, keys: item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).slice(0, 60) : undefined });
      }
      walk(item, nextPath, depth + 1, found);
    }
  }
  return found;
}

const results = [];
for (const response of capture.responses) {
  if (!response.json || !urlPattern.test(response.url)) continue;
  const matches = walk(response.json).filter(function(item, index, list) {
    return (item.type !== 'array' || item.path.match(pattern)) && list.findIndex(function(other) { return other.path === item.path; }) === index;
  });
  if (matches.length) results.push({ url: response.url, bodyLength: response.bodyLength, matches: matches.slice(0, 200) });
}
console.log(JSON.stringify({ file: file, results: results }, null, 2));
