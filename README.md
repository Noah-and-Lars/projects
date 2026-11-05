# projects

- [Cube Assault](cube-assault/): a first-person 3D shooter in a single HTML file.

## Asking Claude from GitHub

Mention `@claude` in an issue, a PR comment or a PR review and Claude replies in the thread. It can answer questions, fix bugs and open pull requests. For example:

```text
@claude why does the turret stop firing after wave 10?
@claude add a pause menu to Cube Assault
```

Only people with write access to this repo can trigger it. The workflow is in [`.github/workflows/claude.yml`](.github/workflows/claude.yml).

### One-time setup

1. Install the [Claude GitHub App](https://github.com/apps/claude) on this repo.
2. Under **Settings → Secrets and variables → Actions**, add a repository secret named `ANTHROPIC_API_KEY` with a key from the [Claude Console](https://platform.claude.com). To use a Claude subscription instead, see the comment in the workflow file.
