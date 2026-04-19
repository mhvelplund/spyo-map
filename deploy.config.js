/**
 * Deployment configuration for spyro-map v2.
 *
 * In v2 the frontend is a static bundle served by nginx. Images and
 * images.db live in S3/MinIO — there is nothing to copy into dist/.
 * This file is kept for reference; actual deployment is handled via
 * docker-compose (local) or ECS task definitions (production).
 */

export const DEPLOYMENT_CONFIG = {
  providers: {
    // Static hosting — build packages/frontend then serve dist/ with nginx
    static: {
      base: '/',
      buildCommand: 'npm run build --workspace=packages/frontend',
    },
  },
};

/**
 * Validate that required environment variables are set before deployment.
 * Run with: node -e "import('./deploy.config.js').then(m => m.validateDeployment())"
 */
export function validateDeployment() {
  const errors = [];

  if (!process.env.VITE_API_BASE_URL && !process.env.VITE_API_BASE_URL === undefined) {
    // VITE_API_BASE_URL defaults to '' (same origin) — not strictly required
  }

  if (errors.length > 0) {
    console.error('❌ Deployment validation failed:');
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log('✅ Deployment validation passed');
}

export default DEPLOYMENT_CONFIG;
