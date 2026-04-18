#!/usr/bin/env node

/**
 * Build Validation Script
 *
 * Validates that the build output contains all required files
 * and is properly configured for deployment.
 */

import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

const DIST_DIR = 'dist';
const REQUIRED_FILES = [
  'index.html',
  'images.db',
  'images'
];

const REQUIRED_ASSET_PATTERNS = [
  /assets\/js\/.*\.js$/,
  /assets\/css\/.*\.css$/
];

function validateBuild() {
  console.log('🔍 Validating build output...\n');

  let errors = [];
  let warnings = [];

  // Check if dist directory exists
  if (!existsSync(DIST_DIR)) {
    errors.push(`❌ Build directory '${DIST_DIR}' does not exist. Run 'npm run build' first.`);
    return { errors, warnings };
  }

  // Check required files
  for (const file of REQUIRED_FILES) {
    const filePath = join(DIST_DIR, file);
    if (!existsSync(filePath)) {
      errors.push(`❌ Required file missing: ${file}`);
    } else {
      console.log(`✅ Found: ${file}`);
    }
  }

  // Check for assets
  const assetsDir = join(DIST_DIR, 'assets');
  if (existsSync(assetsDir)) {
    const assetFiles = readdirSync(assetsDir, { recursive: true });

    for (const pattern of REQUIRED_ASSET_PATTERNS) {
      const found = assetFiles.some(file => pattern.test(file.toString()));
      if (!found) {
        warnings.push(`⚠️  No assets found matching pattern: ${pattern}`);
      } else {
        console.log(`✅ Found assets matching: ${pattern}`);
      }
    }
  } else {
    errors.push(`❌ Assets directory not found: ${assetsDir}`);
  }

  // Check images directory structure
  const imagesDir = join(DIST_DIR, 'images');
  if (existsSync(imagesDir)) {
    const imageFiles = readdirSync(imagesDir);
    const thumbnailsDir = join(imagesDir, 'thumbnails');

    if (!existsSync(thumbnailsDir)) {
      warnings.push(`⚠️  Thumbnails directory not found: ${thumbnailsDir}`);
    } else {
      const thumbnailFiles = readdirSync(thumbnailsDir);
      console.log(`✅ Found ${thumbnailFiles.length} thumbnail files`);
    }

    console.log(`✅ Found ${imageFiles.length} items in images directory`);
  }

  // Check database file size
  const dbPath = join(DIST_DIR, 'images.db');
  if (existsSync(dbPath)) {
    const stats = statSync(dbPath);
    if (stats.size === 0) {
      errors.push(`❌ Database file is empty: ${dbPath}`);
    } else {
      console.log(`✅ Database file size: ${(stats.size / 1024).toFixed(2)} KB`);
    }
  }

  // Check index.html for required meta tags
  const indexPath = join(DIST_DIR, 'index.html');
  if (existsSync(indexPath)) {
    const indexContent = require('fs').readFileSync(indexPath, 'utf8');

    const requiredMeta = [
      'viewport',
      'description',
      'og:title',
      'twitter:card'
    ];

    for (const meta of requiredMeta) {
      if (!indexContent.includes(meta)) {
        warnings.push(`⚠️  Missing meta tag: ${meta}`);
      }
    }
  }

  return { errors, warnings };
}

function main() {
  const { errors, warnings } = validateBuild();

  console.log('\n📊 Validation Results:');
  console.log('='.repeat(50));

  if (errors.length === 0) {
    console.log('✅ Build validation passed!');
  } else {
    console.log('❌ Build validation failed:');
    errors.forEach(error => console.log(`  ${error}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`  ${warning}`));
  }

  console.log(`\n📁 Build size: ${getDirSize(DIST_DIR)} MB`);

  if (errors.length > 0) {
    process.exit(1);
  }
}

function getDirSize(dirPath) {
  let totalSize = 0;

  function calculateSize(path) {
    const stats = statSync(path);
    if (stats.isDirectory()) {
      const files = readdirSync(path);
      files.forEach(file => calculateSize(join(path, file)));
    } else {
      totalSize += stats.size;
    }
  }

  if (existsSync(dirPath)) {
    calculateSize(dirPath);
  }

  return (totalSize / (1024 * 1024)).toFixed(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
