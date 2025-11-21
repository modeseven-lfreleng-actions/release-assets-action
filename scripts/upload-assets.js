// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 The Linux Foundation

/**
 * Upload assets to a GitHub release
 * This script is designed to run in the github-script action context
 *
 * @param {object} params - Parameters object
 * @param {object} params.github - Pre-authenticated Octokit client
 * @param {object} params.context - GitHub Actions context
 * @param {object} params.core - @actions/core package
 * @param {object} params.glob - @actions/glob package
 * @param {string} params.assetPathsInput - JSON string of asset paths
 * @param {string} params.releaseTag - Release tag to target
 * @param {string} params.releaseName - Release name to target (optional)
 */
module.exports = async ({ github, context, core, glob, assetPathsInput, releaseTag, releaseName, denyOverwrite }) => {
  const fs = require('fs');
  const path = require('path');

  // Parse inputs
  const denyOverwriteBool = denyOverwrite === 'true' || denyOverwrite === true;
  let assetPaths;
  try {
    assetPaths = JSON.parse(assetPathsInput);
  } catch (error) {
    core.setFailed(
      `Failed to parse asset_paths as JSON: ${error.message}`
    );
    return;
  }

  if (!Array.isArray(assetPaths) || assetPaths.length === 0) {
    core.setFailed('asset_paths must be a non-empty JSON array');
    return;
  }

  // Determine the release tag to use
  let targetTag = releaseTag.trim();
  const trimmedReleaseName = releaseName.trim();

  // If no tag provided, try to extract from github.ref
  if (!targetTag) {
    const ref = context.ref;
    if (ref.startsWith('refs/tags/')) {
      targetTag = ref.replace('refs/tags/', '');
    } else if (!trimmedReleaseName) {
      // No tag and no name provided
      core.setFailed(
        'No release_tag or release_name provided and workflow not triggered by tag push'
      );
      return;
    }
  }

  if (targetTag) {
    core.info(`Target release tag: ${targetTag}`);
  }
  if (trimmedReleaseName) {
    core.info(`Target release name: ${trimmedReleaseName}`);
  }

  // Find the release
  let release;

  // If we have a tag, try to get release by tag first
  // Note: getReleaseByTag does NOT return draft releases, so we always
  // fall back to listing releases if not found
  if (targetTag) {
    try {
      core.info(`Attempting to fetch release by tag: ${targetTag}`);
      core.info(`Repository: ${context.repo.owner}/${context.repo.repo}`);

      const { data } = await github.rest.repos.getReleaseByTag({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag: targetTag
      });
      release = data;
      core.info(
        `Found release by tag: ${release.name} (${release.tag_name})`
      );

      // Validate release name if provided
      if (trimmedReleaseName && release.name !== trimmedReleaseName) {
        core.setFailed(
          `Release name mismatch: found '${release.name}' but expected '${trimmedReleaseName}'`
        );
        return;
      }
    } catch (error) {
      if (error.status === 404) {
        // getReleaseByTag doesn't return draft releases
        // Fall through to list all releases (including drafts)
        core.info('Release not found by tag API (might be draft), searching all releases...');
        release = null;
      } else {
        throw error;
      }
    }
  }

  // If no release found yet, search all releases (includes drafts)
  // This handles: tag not found (draft releases), name-only search, or both
  if (!release && (targetTag || trimmedReleaseName)) {
    core.info('Searching all releases (including drafts)...');

    // Paginate through all releases to find the matching one
    let page = 1;
    let found = false;

    while (!found) {
      const { data: releases } = await github.rest.repos.listReleases({
        owner: context.repo.owner,
        repo: context.repo.repo,
        per_page: 100,
        page: page
      });

      // Match based on what we have:
      // - Tag + Name: match both
      // - Tag only: match tag
      // - Name only: match name
      release = releases.find(r => {
        if (targetTag && trimmedReleaseName) {
          return r.tag_name === targetTag && r.name === trimmedReleaseName;
        } else if (targetTag) {
          return r.tag_name === targetTag;
        } else {
          return r.name === trimmedReleaseName;
        }
      });

      if (release) {
        found = true;
        if (targetTag && trimmedReleaseName) {
          core.info(
            `Found release by tag and name: ${release.name} (${release.tag_name})`
          );
        } else if (targetTag) {
          core.info(
            `Found release by tag: ${release.name} (${release.tag_name})`
          );
        } else {
          core.info(
            `Found release by name: ${release.name} (${release.tag_name})`
          );
        }
        break;
      }

      if (releases.length < 100) {
        // Last page reached, release not found
        break;
      }

      page++;
    }

    if (!release) {
      if (targetTag && trimmedReleaseName) {
        core.setFailed(
          `No release found with tag '${targetTag}' and name '${trimmedReleaseName}'`
        );
      } else if (targetTag) {
        core.setFailed(
          `No release found with tag '${targetTag}'`
        );
      } else {
        core.setFailed(
          `No release found with name '${trimmedReleaseName}'`
        );
      }
      return;
    }
  }

  // Expand glob patterns and collect all files
  const filesToUpload = [];
  for (const pattern of assetPaths) {
    const globber = await glob.create(pattern, {
      followSymbolicLinks: false
    });
    const matches = await globber.glob();

    // Filter out directories (glob returns files and dirs)
    const files = [];
    for (const match of matches) {
      const stat = fs.statSync(match);
      if (stat.isFile()) {
        files.push(match);
      }
    }

    if (files.length === 0) {
      core.warning(`No files matched pattern: ${pattern}`);
    } else {
      core.info(`Pattern '${pattern}' matched ${files.length} file(s)`);
      filesToUpload.push(...files);
    }
  }

  // Deduplicate files to upload
  const uniqueFilesToUpload = [...new Set(filesToUpload)];

  if (uniqueFilesToUpload.length === 0) {
    core.setFailed('No files found to upload');
    return;
  }

  if (filesToUpload.length !== uniqueFilesToUpload.length) {
    core.warning(
      `Removed ${filesToUpload.length - uniqueFilesToUpload.length} duplicate file(s) from overlapping glob patterns`
    );
  }

  core.info(`Total files to upload: ${uniqueFilesToUpload.length}`);

  // Upload each file
  const downloadUrls = [];
  for (const filePath of uniqueFilesToUpload) {
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    core.info(`Uploading: ${fileName} (${fileContent.length} bytes)`);

    try {
      const { data: asset } = await github.rest.repos.uploadReleaseAsset({
        owner: context.repo.owner,
        repo: context.repo.repo,
        release_id: release.id,
        name: fileName,
        data: fileContent
      });

      downloadUrls.push(asset.browser_download_url);
      core.info(`✅ Uploaded: ${fileName}`);
    } catch (error) {
      // If asset already exists, check if overwrite is allowed
      if (error.status === 422 && error.message.includes('already_exists')) {
        if (denyOverwriteBool) {
          core.setFailed(
            `Error: Overwriting artifacts is not prohibited ❌\n` +
            `Asset '${fileName}' already exists in this release.\n` +
            `Set 'deny_overwrite: false' to allow replacing existing assets.`
          );
          throw error;
        }

        core.warning(`Glob wildcard overwriting existing file ${fileName}`);

        try {
          // Find the existing asset
          const existingAsset = release.assets.find(a => a.name === fileName);
          if (existingAsset) {
            // Delete the existing asset
            await github.rest.repos.deleteReleaseAsset({
              owner: context.repo.owner,
              repo: context.repo.repo,
              asset_id: existingAsset.id
            });
            core.info(`Deleted existing asset: ${fileName}`);

            // Retry the upload
            const { data: asset } = await github.rest.repos.uploadReleaseAsset({
              owner: context.repo.owner,
              repo: context.repo.repo,
              release_id: release.id,
              name: fileName,
              data: fileContent
            });

            downloadUrls.push(asset.browser_download_url);
            core.info(`✅ Uploaded: ${fileName}`);
          } else {
            core.error(`Asset ${fileName} not found in release assets list`);
            throw error;
          }
        } catch (retryError) {
          core.error(`Failed to replace ${fileName}: ${retryError.message}`);
          throw retryError;
        }
      } else {
        core.error(`Failed to upload ${fileName}: ${error.message}`);
        throw error;
      }
    }
  }

  // Set output
  core.setOutput('download_urls', JSON.stringify(downloadUrls));
  core.info(`✅ Successfully uploaded ${downloadUrls.length} asset(s)`);

  // Add to step summary
  core.summary
    .addHeading('Release Assets Uploaded', 2)
    .addRaw(`Release: ${release.name} (${release.tag_name})`, true)
    .addBreak()
    .addList(
      downloadUrls.map(url => `[${path.basename(url)}](${url})`)
    )
    .write();
};
