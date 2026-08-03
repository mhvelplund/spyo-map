import { loadConfig } from './config.js';
import { createS3Client } from './storage.js';
import { createD1Client } from './d1.js';
import { runExtractor } from './extractor.js';

async function main(): Promise<void> {
  console.log('Spyo Map Extractor');
  console.log('==================');

  const config = loadConfig();
  const s3 = createS3Client(config);
  const d1 = createD1Client(config);

  await runExtractor(config, s3, d1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
