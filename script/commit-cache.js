// scripts/commit-cache.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configure these values
const CACHE_CSV_PATH = '/app/host-cache/music-cache.csv'; // Path to your CSV file
const CACHE_FILE_PATH = '/app/host-cache/music-cache.json'; // Path to your cache file
const COMMIT_INTERNAL_MINUTES = 15; // How often to commit (adjust as needed)
const REPO_PATH = process.cwd(); // Root of your project

function commitCache() {
    try {
        // Get current timestamp for the commit message
        const timestamp = new Date().toISOString();

        console.log(`[${timestamp}] Checking cache file for changes...`);

        // Make sure the file exists
        if (!fs.existsSync(CACHE_FILE_PATH)) {
            console.log(`Cache file not found at ${CACHE_FILE_PATH}`);
            return;
        }

        // Check file size to make sure it's not empty
        const stats = fs.statSync(CACHE_FILE_PATH);
        if (stats.size === 0) {
            console.log('Cache file is empty, skipping commit');
            return;
        }

        if (!fs.existsSync(CACHE_CSV_PATH)) {
            console.log(`Cache file not found at ${CACHE_FILE_PATH}`);
            return;
        }

        // Check file size to make sure it's not empty
        const statscsv = fs.statSync(CACHE_CSV_PATH);
        if (statscsv.size === 0) {
            console.log('Cache file is empty, skipping commit');
            return;
        }

        // Set up git config if needed
        execSync('git config --global user.email "bot@example.com"', { cwd: REPO_PATH });
        execSync('git config --global user.name "Cache Update Bot"', { cwd: REPO_PATH });

        // Pull the latest changes to avoid conflicts
        console.log('Pulling latest changes...');
        execSync('git pull', { cwd: REPO_PATH });

        // Add only the cache file
        console.log('Adding cache file...');
        execSync(`git add "${CACHE_FILE_PATH}"`, { cwd: REPO_PATH });
        execSync(`git add "${CACHE_CSV_PATH}"`, { cwd: REPO_PATH });

        // Check if there are changes to commit
        const status = execSync('git status --porcelain', { cwd: REPO_PATH }).toString();
        if (!status) {
            console.log('No changes to commit - skipping');
            return;
        }

        // Commit and push
        console.log('Committing cache file...');
        execSync(`git commit -m "Auto-update cache file - ${timestamp}"`, { cwd: REPO_PATH });

        // Use the fine-grained token for authentication
        const token = process.env.GIT_AUTH_TOKEN;
        if (!token) {
            console.error('GIT_AUTH_TOKEN environment variable not set');
            return;
        }

        console.log('Pushing to repository...');
        // Use the token for authentication
        const repoUrl = execSync('git config --get remote.origin.url', { cwd: REPO_PATH }).toString().trim();
        const tokenizedUrl = repoUrl.replace('https://', `https://${token}@`);
        execSync(`git push "${tokenizedUrl}"`, { cwd: REPO_PATH });

        console.log('Cache file successfully committed and pushed');
    } catch (error) {
        console.error('Error committing cache file:', error.message);
    }
}

// For testing: Run the function once immediately
commitCache();

// Export for use in scheduler
module.exports = { commitCache };