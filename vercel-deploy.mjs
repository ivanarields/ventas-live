import fetch from 'node-fetch';

const TOKEN = process.env.VERCEL_TOKEN || 'your-token-here';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const PROJECT_ID = 'prj_gNNLSgdwI2QSyPLmoAZ0PksGNUdG';

// 1. Ver detalles completos del proyecto para obtener el link con repoId
const proj = await (await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}`, { headers: H })).json();
console.log('Link config:', JSON.stringify(proj.link, null, 2));

// 2. Listar deployments recientes para ver el estado
const deps = await (await fetch(`https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&limit=3&target=production`, { headers: H })).json();
console.log('\nÚltimos deployments:');
for (const d of deps.deployments || []) {
  console.log(`  ${d.uid} | ${d.readyState} | ${d.meta?.githubCommitMessage?.slice(0,50)} | ${new Date(d.createdAt).toLocaleString('es-BO')}`);
}
