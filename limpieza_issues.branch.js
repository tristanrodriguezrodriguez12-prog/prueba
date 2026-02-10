import fetch from "node-fetch"; // Node 18+ tiene fetch nativo
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const DAYS_LIMIT = parseInt(process.env.DAYS_LIMIT || "30");

if (!TOKEN || !REPO) {
  console.error("BOT_TOKEN y GITHUB_REPOSITORY deben estar definidos en .env");
  process.exit(1);
}

const headers = {
  Authorization: `token ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json"
};

async function cleanIssues() {
  try {
    // Obtener issues abiertos
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`, {
      headers
    });

    if (!res.ok) {
      throw new Error(`Error al obtener issues: ${res.status} ${res.statusText}`);
    }

    const issues = await res.json();

    for (const issue of issues) {
      // Ignorar PRs
      if (issue.pull_request) continue;

      const lastUpdate = new Date(issue.updated_at);
      const now = new Date();
      const diffDays = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));

      if (diffDays > DAYS_LIMIT) {
        console.log(`Cerrando issue #${issue.number} (${issue.title})`);

        // Cerrar el issue
        const closeRes = await fetch(`https://api.github.com/repos/${REPO}/issues/${issue.number}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ state: "closed" })
        });

        if (!closeRes.ok) {
          console.error(`No se pudo cerrar el issue #${issue.number}`);
        } else {
          console.log(`Issue #${issue.number} cerrado`);
        }
      }
    }

    console.log("Bot finalizado");
  } catch (err) {
    console.error("Error:", err);
  }
}

// Ejecutar
cleanIssues();
