<!--
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2025 The Linux Foundation
-->

# 📦 Upload Assets to GitHub Release

Uploads build artifacts and other workflow assets to a GitHub release.

## release-assets-action

Lightweight GitHub Action that uploads assets to releases with support for:

- **Glob patterns** - Upload files with wildcards
- **Draft and published releases** - Works with any release state
- **Flexible targeting** - Find releases by tag, name, or both
- **Pure JavaScript** - No external dependencies or compiled artifacts

## Usage Example

### Basic Usage (Tag-triggered workflow)

<!-- markdownlint-disable MD013 MD046 -->

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Build artifacts
        run: make build

      - name: Upload release assets
        uses: lfreleng-actions/release-assets-action@v0.1.0
        with:
          asset_paths: '["dist/*.tar.gz", "dist/*.zip"]'
```

### Specify Release Tag

```yaml
      - name: Upload to specific release
        uses: lfreleng-actions/release-assets-action@v0.1.0
        with:
          asset_paths: '["build/**/*.whl", "build/**/*.tar.gz"]'
          release_tag: 'v1.2.3'
```

### Match by Tag and Name

```yaml
      - name: Upload with validation
        uses: lfreleng-actions/release-assets-action@v0.1.0
        with:
          asset_paths: '["artifacts/*.bin"]'
          release_tag: 'v1.0.0'
          release_name: 'Release v1.0.0'
```

<!-- markdownlint-enable MD013 MD046 -->

## Inputs

<!-- markdownlint-disable MD013 -->

| Name            | Required | Default | Description                                                  |
| --------------- | -------- | ------- | ------------------------------------------------------------ |
| asset_paths     | True     | N/A     | JSON array of file paths/globs to upload                     |
| release_tag     | False    | (auto)  | Tag of the release (auto-detected from tag push)             |
| release_name    | False    | N/A     | Name of the release (must match tag if both provided)        |
| deny_overwrite  | False    | true    | Prevent overwriting existing assets (set false to allow)     |

<!-- markdownlint-enable MD013 -->

### Input Details

#### `asset_paths`

A JSON array of file paths or glob patterns. The action will expand
globs and upload all matching files.

**Examples:**

```yaml
asset_paths: '["dist/my-app.tar.gz"]'
asset_paths: '["dist/*.tar.gz", "dist/*.zip"]'
asset_paths: '["build/**/*.whl"]'
```

#### `release_tag`

The git tag associated with the release. If not provided, the action
automatically extracts it from `github.ref` when the workflow runs on
a tag push.

**Note:** The release must already exist. This action does not create releases.

#### `release_name`

Optional release name for validation. If provided along with
`release_tag`, both must match the target release, otherwise the
action fails.

#### `deny_overwrite`

Controls whether the action can overwrite existing assets with the same name.

- **Default**: `true` (denies overwrites)
- **Set to `false`**: Allows replacing existing assets

When set to `true` (default), the action fails with an error if an asset
already exists. When set to `false`, the action deletes and replaces
existing assets with the new upload.

**Example:**

```yaml
- name: Upload with overwrite allowed
  uses: lfreleng-actions/release-assets-action@v0.1.0
  with:
    asset_paths: '["dist/*.tar.gz"]'
    deny_overwrite: false
```

## Outputs

<!-- markdownlint-disable MD013 -->

| Name           | Description                                |
| -------------- | ------------------------------------------ |
| download_urls  | JSON array of download URLs for the assets |

<!-- markdownlint-enable MD013 -->

## Implementation Details

This action uses `actions/github-script` to execute JavaScript
directly within the workflow, avoiding the need for compiled artifacts
or separate source files. The implementation:

1. **Parses inputs** - Validates JSON array format for asset paths
2. **Determines target** - Gets release tag from input or GitHub
   context
3. **Finds release** - Uses GitHub API to locate the release by tag
   (and optionally name)
4. **Expands globs** - Processes glob patterns to find all matching files
5. **Uploads assets** - Uses GitHub API to upload each file to the release
6. **Returns URLs** - Outputs download URLs for uploaded assets

The action works with both draft and published releases, as long as
they exist in the repository.

## Permissions

The action requires `contents: write` permission:

```yaml
permissions:
  contents: write
```

## Common Use Cases

### Attach build artifacts after PyPI release

```yaml
- name: Publish to PyPI
  run: twine upload dist/*

- name: Attach artifacts to GitHub release
  uses: lfreleng-actions/release-assets-action@v0.1.0
  with:
    asset_paths: '["dist/*.whl", "dist/*.tar.gz"]'
```

### Upload SBOM files

```yaml
- name: Generate SBOM
  run: syft . -o cyclonedx-json=sbom.json

- name: Attach SBOM to release
  uses: lfreleng-actions/release-assets-action@v0.1.0
  with:
    asset_paths: '["sbom.json"]'
    release_tag: ${{ github.ref_name }}
```

### Different artifact types

```yaml
- name: Upload all release artifacts
  uses: lfreleng-actions/release-assets-action@v0.1.0
  with:
    asset_paths: |
      [
        "dist/*.whl",
        "dist/*.tar.gz",
        "checksums.txt",
        "*.sig"
      ]
```

## Troubleshooting

### "No release found for tag"

Ensure the release exists before running this action. Draft releases created by
`release-drafter` or similar tools should work, as long as the tag name matches.

### "Release name mismatch"

If you specify both `release_tag` and `release_name`, they must both
match the target release. Check that the release name in GitHub
matches.

### "No files found to upload"

Check that:

1. The glob patterns are correct
2. Files exist at the specified paths
3. The workflow has checked out the code or generated the files

## Notes

- The action does **not** create releases - it uploads to existing ones
- By default, the action denies overwriting existing assets
  (set `deny_overwrite: false` to allow overwrites)
- Upload operations are sequential, not parallel
<!-- markdownlint-disable-next-line MD013 -->
- Glob patterns use the [`@actions/glob`](https://github.com/actions/toolkit/tree/main/packages/glob) package syntax (see its documentation for details)
