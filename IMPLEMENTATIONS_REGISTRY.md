# Bitcoin Commons Implementations Registry

This is a **public, self-service registry** for implementations using the Bitcoin Commons framework. Anyone can add their implementation via pull request—no approval needed if automated validation passes.

## How to Add Your Implementation

1. **Fork this repository** (or create a branch if you have access)

2. **Edit `implementations-registry.yml`** and add your implementation:
   ```yaml
   - name: Your Implementation Name
     description: Brief description (1-2 sentences max)
     website: https://your-website.org
     downloads: https://your-website.org#download
     github: https://github.com/your-org
     verified: false  # Set to true after verification
   ```

3. **Submit a pull request**
   - When creating the PR, GitHub will automatically use the [pull request template](.github/pull_request_template.md)
   - Fill out the template with your implementation details
   - The template includes a checklist to ensure you've completed all steps

4. **Automated validation** will check:
   - YAML syntax is valid
   - All required fields are present
   - URLs are properly formatted
   - No duplicate names or GitHub URLs
   - Description and name length limits

5. **If validation passes**, the PR will be merged automatically (or with minimal review)

## Required Fields

- `name`: Display name (max 100 characters)
- `description`: Brief description (max 500 characters)
- `website`: Full URL to your implementation's website
- `downloads`: Full URL to downloads page (can use `#download` anchor)
- `github`: Full URL to GitHub organization or main repository
- `verified`: `true` or `false` (set to `true` after basic verification that you're using Commons)

## Principles

This registry follows cypherpunk principles:

- **Permissionless**: No gatekeeping, anyone can add themselves
- **Transparent**: All submissions are public PRs
- **Automated**: Validation ensures quality without human bias
- **Decentralized**: No central authority controls the list
- **Self-service**: No "contact us" required

## Verification

The `verified` field indicates whether an implementation has been verified to actually use the Bitcoin Commons framework. This can be checked by:
- Presence of governance configuration files
- Links to Commons documentation
- Evidence of using Commons governance model

Verification is optional and doesn't block listing—it's just a signal to users.

