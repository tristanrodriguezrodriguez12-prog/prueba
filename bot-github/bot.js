require('dotenv').config();
const express = require('express');
const https = require('https');

const app = express();
app.use(express.json());

// ─── Configuración (viene del archivo .env) ───────────────────────────────────
const GITHUB_TOKEN      = process.env.GITHUB_TOKEN;
const REPO_OWNER        = process.env.REPO_OWNER;
const REPO_NAME         = process.env.REPO_NAME;
const PROTECTED_BRANCH  = process.env.PROTECTED_BRANCH || 'main';


// ─── Función para llamar a la API de GitHub ───────────────────────────────────
function githubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'github-bot',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}


// ─── Verifica si la rama está al día con main ─────────────────────────────────
async function isBranchUpToDate(featureBranch, baseBranch) {
  const url = `/repos/${REPO_OWNER}/${REPO_NAME}/compare/${featureBranch}...${baseBranch}`;
  const result = await githubRequest('GET', url);

  const commitsFaltantes = result.behind_by;
  console.log(`📊 A la rama le faltan ${commitsFaltantes} commit(s) de ${baseBranch}`);

  return commitsFaltantes === 0; // true = está al día
}


// ─── Pone un estado verde o rojo en el commit ─────────────────────────────────
async function setCommitStatus(sha, state, description) {
  const url = `/repos/${REPO_OWNER}/${REPO_NAME}/statuses/${sha}`;
  await githubRequest('POST', url, {
    state: state,               // 'success' o 'failure'
    description: description,
    context: 'bot/rama-actualizada'
  });
  console.log(`🔔 Estado del commit: ${state} — ${description}`);
}


// ─── Escribe un comentario en el Pull Request ─────────────────────────────────
async function comentarEnPR(numeroPR, mensaje) {
  const url = `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${numeroPR}/comments`;
  await githubRequest('POST', url, { body: mensaje });
  console.log(`💬 Comentario enviado al PR #${numeroPR}`);
}


// ─── Punto de entrada: GitHub envía los eventos aquí ─────────────────────────
app.post('/webhook', async (req, res) => {
  const evento = req.headers['x-github-event'];
  console.log(`\n📩 Evento recibido: ${evento}`);

  // Solo nos interesan los Pull Requests
  if (evento !== 'pull_request') {
    return res.send('OK');
  }

  const { action, number, pull_request } = req.body;

  // Solo actuar cuando se abre o actualiza un PR
  if (action !== 'opened' && action !== 'synchronize') {
    return res.send('OK');
  }

  const ramaOrigen  = pull_request.head.ref;  // rama del desarrollador
  const ramaDestino = pull_request.base.ref;  // rama destino (main)
  const sha         = pull_request.head.sha;  // identificador del commit

  console.log(`🔍 PR #${number}: ${ramaOrigen} → ${ramaDestino}`);

  // Solo revisar PRs que van hacia la rama protegida
  if (ramaDestino !== PROTECTED_BRANCH) {
    return res.send('OK');
  }

  try {
    const estaAlDia = await isBranchUpToDate(ramaOrigen, PROTECTED_BRANCH);

    if (estaAlDia) {
      // Todo bien, aprobar
      await setCommitStatus(sha, 'success', ` Rama actualizada con ${PROTECTED_BRANCH}`);
      console.log('✅ PR aprobado');

    } else {
      //  Le faltan commits, bloquear
      await setCommitStatus(sha, 'failure', ` Debes actualizar tu rama con ${PROTECTED_BRANCH}`);
      await comentarEnPR(number,
        `⚠️ **Pull Request bloqueado**\n\n` +
        `Tu rama \`${ramaOrigen}\` no está actualizada con \`${PROTECTED_BRANCH}\`.\n\n` +
        `**Ejecuta estos comandos y vuelve a hacer push:**\n` +
        `\`\`\`bash\n` +
        `git fetch origin\n` +
        `git rebase origin/${PROTECTED_BRANCH}\n` +
        `\`\`\`\n\n` +
        `Una vez hecho, el bot revisará automáticamente de nuevo.`
      );
      console.log(' PR bloqueado — rama desactualizada');
    }

  } catch (error) {
    console.error(' Error:', error.message);
  }

  res.send('OK');
});


// ─── Arrancar el servidor ─────────────────────────────────────────────────────
const PUERTO = 3000;
app.listen(PUERTO, () => {
  console.log(`Bot activo en http://localhost:${PUERTO}/webhook`);
});