// Copyright (C) 2026 wdk08. SPDX-License-Identifier: GPL-3.0-only
const fs = require('node:fs');

function assertDraft(release, version, commit) {
  if (!release?.draft || release.prerelease || release.tag_name !== `v${version}` ||
      (commit && release.target_commitish !== commit)) throw new Error('Expected an accessible unpublished draft with the exact tag and commit.');
  return release;
}
async function ensureDraft(github, repo, {version, commit, refresh, body}) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid release version/commit.');
  const tag = `v${version}`, name = `ScriptForge ${tag}`;
  const releases = await github.paginate(github.rest.repos.listReleases, repo);
  const matches = releases.filter(r => r.tag_name === tag || (r.name === name && r.draft && r.tag_name.startsWith('untagged-')));
  if (matches.length > 1) throw new Error('Ambiguous draft identity.');
  let release = matches[0];
  if (release && (!release.draft || release.prerelease || !refresh)) throw new Error('Published releases are immutable; refreshing drafts requires explicit approval.');
  try { await github.rest.git.getRef({...repo, ref:`tags/${tag}`}); throw new Error('Tag already exists; refusing to retarget it.'); }
  catch (error) { if (error.status !== 404) throw error; }
  if (!release) {
    if (!releases.some(r => !r.draft && !r.prerelease) && version !== '1.0.0') throw new Error('The first release must be 1.0.0.');
    ({data:release} = await github.rest.repos.createRelease({...repo, tag_name:tag, target_commitish:commit, name, body, draft:true, prerelease:false}));
  } else if (release.tag_name !== tag) {
    // GitHub can assign an untagged-* placeholder when an update omits tag_name.
    ({data:release} = await github.rest.repos.updateRelease({...repo, release_id:release.id, tag_name:tag, draft:true}));
  }
  const {data:readback} = await github.rest.repos.getRelease({...repo, release_id:release.id});
  return assertDraft(readback, version);
}
async function uploadFiles(github, repo, {id, version, commit, files}) {
  const {data:release} = await github.rest.repos.getRelease({...repo, release_id:Number(id)});
  assertDraft(release, version, commit);
  for (const file of files) {
    const bytes = fs.readFileSync(file), name = require('node:path').basename(file);
    const {data:asset} = await github.rest.repos.uploadReleaseAsset({...repo, release_id:release.id, name, data:bytes,
      headers:{'content-type':'application/octet-stream','content-length':bytes.length}});
    if (asset.name !== name || asset.size !== bytes.length || asset.state !== 'uploaded') throw new Error(`Upload readback failed: ${name}`);
  }
}
async function probeAttachment(github, repo, release, version, suffix) {
  assertDraft(release, version);
  const name = `preflight-${suffix}.txt`, data = Buffer.from('ScriptForge release attachment permission check\n');
  const {data:asset} = await github.rest.repos.uploadReleaseAsset({...repo, release_id:release.id, name, data,
    headers:{'content-type':'text/plain','content-length':data.length}});
  await github.rest.repos.deleteReleaseAsset({...repo, asset_id:asset.id});
}
function verifyRun(run, jobs, workflowId, commit) {
  if (run.workflow_id !== workflowId || run.head_sha !== commit || run.head_branch !== 'main' || run.event !== 'workflow_dispatch' || run.status !== 'completed') throw new Error('Artifact run does not match the exact reviewed app commit/workflow.');
  for (const name of ['validation / source','review',
    'validation / build (macos-15, aarch64-apple-darwin, arm64, dmg,app)',
    'validation / build (macos-15-intel, x86_64-apple-darwin, x86_64, dmg,app)',
    'validation / build (windows-latest, x86_64-pc-windows-msvc, nsis)']) {
    const job = jobs.find(j => j.name === name);
    if (job?.conclusion !== 'success') throw new Error(`Required validation missing: ${name}`);
    if (name.startsWith('validation / build')) for (const step of ['Verify actual updater artifact signatures and versions','Real installed-app update and restart using signed production bytes']) {
      if (!job.steps?.some(s => s.name === step && s.conclusion === 'success')) throw new Error(`Required proof missing: ${step}`);
    }
  }
}
module.exports = {assertDraft, ensureDraft, uploadFiles, probeAttachment, verifyRun};
