import fs from 'node:fs';
import path from 'node:path';
import { normalizeSem3ueCapture } from '../lib/sem3ue-normalizer.js';

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const visiblePath = process.argv[4];
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/normalize-sem3ue-capture.js <backlinks-capture.json> <output.json> [visible-overview.json]');
  process.exit(2);
}

const backlinksCapture = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const visibleOverview = visiblePath ? JSON.parse(fs.readFileSync(visiblePath, 'utf8')) : {};
const result = normalizeSem3ueCapture({ backlinksCapture: backlinksCapture, visibleOverview: visibleOverview });
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  outputPath: path.resolve(outputPath),
  domain: result.domain,
  records: result.backlinks.length,
  total: result.pagination.total,
  page: result.pagination.page,
  completePage: result.dataQuality.completePage
}));
