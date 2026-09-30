import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Pass one or more JSON/JSONL files');

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/gmitm|token|auth|session|key|signature|(^|_)sig($|_)|csrf|cookie/i.test(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return url.toString();
  } catch {
    return value.replace(/([?&](?:gmitm|token|auth|session|key|signature|csrf|cookie)=)[^&\s"]+/gi, '$1[REDACTED]');
  }
}

function sanitize(value, key = '') {
  if (typeof value === 'string') {
    if (/password|cookie|token|authorization|secret|session|csrf/i.test(key)) return '[REDACTED]';
    if (/^https?:\/\//i.test(value) || /[?&](?:gmitm|key|token)=/i.test(value)) return sanitizeUrl(value);
    if (key === 'body') {
      try { return JSON.stringify(sanitize(JSON.parse(value))); } catch {}
    }
    return value.replace(/([?&](?:gmitm|token|auth|session|key|signature|csrf|cookie)=)[^&\s"]+/gi, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(function(item) { return sanitize(item, key); });
  if (value && typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) output[childKey] = sanitize(childValue, childKey);
    return output;
  }
  return value;
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.jsonl')) {
    const lines = text.split(/\r?\n/).filter(Boolean).map(function(line) { return JSON.stringify(sanitize(JSON.parse(line))); });
    fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''));
  } else {
    fs.writeFileSync(file, JSON.stringify(sanitize(JSON.parse(text)), null, 2) + '\n');
  }
  console.log('sanitized ' + file);
}
