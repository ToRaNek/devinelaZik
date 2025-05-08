// scripts/commit-cache-api.js
const fs = require('fs');
const { Octokit } = require('@octokit/rest');

// Configuration
const CACHE_FILES = [
    {
        localPath: '/app/host-cache/music-cache.json',
        repoPath: 'cache/music-cache.json',
        description: 'JSON cache file'
    },
    {
        localPath: '/app/host-cache/music-cache.csv',
        repoPath: 'cache/music-cache.csv',
        description: 'CSV cache file'
    }
];

// GitHub repository details
const GITHUB_OWNER = 'ToRaNek';
const GITHUB_REPO = 'devinelaZik';

// The updateCacheFiles function - this needs to be properly exported
async function updateCacheFiles() {
    try {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Checking cache files for changes...`);

        // Initialize GitHub API client
        const token = process.env.GIT_AUTH_TOKEN;
        if (!token) {
            console.error('GIT_AUTH_TOKEN environment variable not set');
            return;
        }

        const octokit = new Octokit({ auth: token });

        // Verify repository exists before proceeding
        try {
            await octokit.repos.get({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO
            });
            console.log(`Repository ${GITHUB_OWNER}/${GITHUB_REPO} confirmed to exist`);
        } catch (repoError) {
            console.error(`Repository not found or access denied: ${repoError.message}`);
            console.log('Please ensure the repository exists and your token has correct access');
            return;
        }

        // Process each file
        for (const cacheFile of CACHE_FILES) {
            try {
                console.log(`Processing ${cacheFile.description}: ${cacheFile.localPath}`);

                // Check if file exists locally
                if (!fs.existsSync(cacheFile.localPath)) {
                    console.log(`File not found at ${cacheFile.localPath}, skipping`);
                    continue;
                }

                // Check file size
                const stats = fs.statSync(cacheFile.localPath);
                if (stats.size === 0) {
                    console.log(`File is empty, skipping update for ${cacheFile.description}`);
                    continue;
                }

                // Read the file content
                const fileContent = fs.readFileSync(cacheFile.localPath, 'utf8');

                // Check if file exists in the repository and get its SHA if it does
                let fileSha;
                try {
                    const { data: existingFile } = await octokit.repos.getContent({
                        owner: GITHUB_OWNER,
                        repo: GITHUB_REPO,
                        path: cacheFile.repoPath,
                    });
                    fileSha = existingFile.sha;
                    console.log(`Existing ${cacheFile.description} found in repository`);
                } catch (error) {
                    if (error.status === 404) {
                        console.log(`${cacheFile.description} does not exist in repository yet, will create new file`);
                    } else {
                        throw error;
                    }
                }

                // Update or create the file
                const commitMessage = `Auto-update ${cacheFile.description} - ${timestamp}`;
                const content = Buffer.from(fileContent).toString('base64');

                await octokit.repos.createOrUpdateFileContents({
                    owner: GITHUB_OWNER,
                    repo: GITHUB_REPO,
                    path: cacheFile.repoPath,
                    message: commitMessage,
                    content: content,
                    sha: fileSha, // Include SHA if file exists, omit for new files
                });

                console.log(`${cacheFile.description} successfully ${fileSha ? 'updated' : 'created'} in repository`);
            } catch (fileError) {
                console.error(`Error handling ${cacheFile.description}:`, fileError.message);
                // Continue with the next file even if this one fails
            }
        }

        console.log('Cache update process completed');
    } catch (error) {
        console.error('Error in updateCacheFiles:', error.message);
    }
}

// Make sure we explicitly export the function
module.exports = {
    updateCacheFiles: updateCacheFiles
};