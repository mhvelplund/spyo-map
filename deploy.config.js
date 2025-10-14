/**
 * Deployment Configuration for Spyo Map
 *
 * This file contains configuration and utilities for deploying the application
 * to various static hosting providers.
 */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DEPLOYMENT_CONFIG = {
	// Required files that must be copied to dist
	requiredFiles: ["public/images.db", "public/images/**/*"],

	// Static hosting providers configuration
	providers: {
		// GitHub Pages
		githubPages: {
			base: "/spyo-map/",
			buildCommand: "npm run build:github",
			deployCommand: "gh-pages -d dist",
		},

		// Generic static hosting
		static: {
			base: "/",
			buildCommand: "npm run build",
		},
	},
};

/**
 * Copy required files to dist directory after build
 */
export function copyRequiredFiles() {
	const distDir = "dist";

	// Ensure dist directory exists
	if (!existsSync(distDir)) {
		mkdirSync(distDir, { recursive: true });
	}

	// Copy SQLite database
	if (existsSync("public/images.db")) {
		copyFileSync("public/images.db", join(distDir, "images.db"));
		console.log("✓ Copied images.db to dist/");
	} else {
		console.warn(
			"⚠ Warning: public/images.db not found. Run extract_exif.py first.",
		);
	}

	// Copy images directory
	if (existsSync("public/images")) {
		execSync('xcopy "public\\images" "dist\\images" /E /I /Y', {
			stdio: "inherit",
		});
		console.log("✓ Copied images directory to dist/");
	} else {
		console.warn("⚠ Warning: public/images directory not found.");
	}

	// Copy .htaccess for Apache hosting
	if (existsSync("public/.htaccess")) {
		copyFileSync("public/.htaccess", join(distDir, ".htaccess"));
		console.log("✓ Copied .htaccess to dist/");
	}
}

/**
 * Validate deployment requirements
 */
export function validateDeployment() {
	const errors = [];

	// Check for required environment variables
	if (!process.env.VITE_GOOGLE_MAPS_API_KEY) {
		errors.push("VITE_GOOGLE_MAPS_API_KEY environment variable is required");
	}

	// Check for required files
	if (!existsSync("public/images.db")) {
		errors.push(
			"public/images.db is required. Run extract_exif.py to generate it.",
		);
	}

	if (!existsSync("public/images")) {
		errors.push("public/images directory is required.");
	}

	if (errors.length > 0) {
		console.error("❌ Deployment validation failed:");
		errors.forEach((error) => console.error(`  - ${error}`));
		process.exit(1);
	}

	console.log("✅ Deployment validation passed");
}

export default DEPLOYMENT_CONFIG;
