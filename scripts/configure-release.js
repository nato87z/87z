'use strict';

const fs = require('fs');
const path = require('path');

const repository = process.env.GITHUB_REPOSITORY || '';
const [owner, repo] = repository.split('/');
if (!owner || !repo) {
  console.error('[87Z] GITHUB_REPOSITORY ausente. O canal de atualização não foi configurado.');
  process.exit(1);
}

const target = path.join(__dirname, '..', 'update-config.json');
fs.writeFileSync(target, JSON.stringify({provider:'github',owner,repo,channel:'latest'}, null, 2) + '\n');
console.log(`[87Z] Canal de atualização configurado para ${owner}/${repo}.`);
