import { loadConfig } from './config.js';
import { createS3Client } from './storage.js';
import { runExtractor } from './extractor.js';

async function main(): Promise<void> {
  console.log('Spyro Map Extractor');
  console.log('===================');

  const config = loadConfig();
  const s3 = createS3Client(config);

  await runExtractor(config, s3);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
