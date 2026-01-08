# Quick Test Checklist

## Pre-flight
- [ ] `DEPLOY_REPO_TOKEN` secret is configured in GitHub
- [ ] Token has write access to `sumrender/deployment-basics-configuration`

## Trigger Test
- [ ] Make a small change to `backend/` or `frontend/`
- [ ] Push to `main` branch (or use workflow_dispatch)

## Verify Workflow
- [ ] Workflow run appears in Actions tab
- [ ] Build jobs complete successfully
- [ ] `update_staging_manifests` job completes successfully
- [ ] No errors in workflow logs

## Verify PR
- [ ] PR appears in `sumrender/deployment-basics-configuration`
- [ ] PR title: `chore(staging): bump images to <sha>`
- [ ] PR has `autobump` label
- [ ] Only staging deployment files are changed
- [ ] Image tags updated to correct SHA

## Success Criteria
✅ Images pushed to Docker Hub with SHA tag
✅ PR created in config repo
✅ PR contains correct image updates
✅ No errors in workflow execution

