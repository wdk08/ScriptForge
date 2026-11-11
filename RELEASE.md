# Release ScriptForge

Start from a clean branch that includes `origin/main`. Install the locked npm dependencies and sign in with `gh auth login` using an account with write access to `wdk08/ScriptForge`.

```sh
npm run release
```

Choose patch, minor, major, or a custom stable version. The command uses the latest stable release as its starting point. It reads the version's notes from `releases/` if they exist, or prompts for a short note. Review the commits and type the requested confirmation. The command updates version metadata, validates the source, commits the release, pushes to `main`, and starts the existing official release workflow.

GitHub Actions builds and signs the macOS and Windows installers, validates updates, creates the tag, and publishes the release. The tag is created after validation, so leave it to the workflow. Track the run using the URL printed by the command.

- **Dirty or behind branch.** Commit or stash changes and integrate `origin/main` before retrying.
- **Local validation failed.** Fix the reported issue and review any version or notes edits before committing. You can then choose the same version if it still has no draft or tag.
- **Push or dispatch failed.** Check Git and GitHub CLI access. If the release commit already exists locally, the same version can be retried from that clean commit if no draft or tag exists.
- **Workflow failed or a draft exists.** Open the failed job and follow [the release recovery instructions](RELEASING.md). Check updater signing secrets in GitHub Actions if signing fails.
