#!/usr/bin/env node
// Garde-fous git/fichiers pour Claude Code (voir .claude/skills/git-github/SKILL.md).
// PreToolUse : bloque (exit 2) les opérations interdites.
// PostToolUse : rappelle (exit 2, non bloquant a posteriori) le redéploiement des edge functions.

import { execSync } from "node:child_process";

const input = JSON.parse(await readStdin());
const event = input.hook_event_name ?? "";
const toolName = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

function currentBranch() {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

if (event === "PreToolUse" && toolName === "Bash") {
  const cmd = String(toolInput.command ?? "");

  // Force push : interdit (sauf --force-with-lease, toléré hors main).
  if (/git\s+push\b/.test(cmd)) {
    const hasForce = /(^|\s)(--force|-f)(\s|$)/.test(cmd) && !/--force-with-lease/.test(cmd);
    if (hasForce) {
      block("⛔ git push --force interdit. Utiliser --force-with-lease, et uniquement sur ta propre branche de travail.");
    }
    // Push visant main/master explicitement, ou depuis main sans destination explicite.
    const targetsMain = /git\s+push\b[^|;&]*\s(origin\s+)?(main|master)(\s|:|$)/.test(cmd);
    const implicitFromMain = !/git\s+push\b[^|;&]*\s\S+\s+\S+/.test(cmd) && ["main", "master"].includes(currentBranch());
    if (targetsMain || implicitFromMain) {
      block("⛔ Push sur main interdit (auto-déployé sur Vercel). Pousser sur une branche et passer par une PR.");
    }
  }

  // Commit sur main : interdit.
  if (/git\s+commit\b/.test(cmd) && ["main", "master"].includes(currentBranch())) {
    block("⛔ Commit direct sur main interdit. Créer une branche : git checkout -b <type>/<sujet>");
  }

  process.exit(0);
}

const filePath = String(toolInput.file_path ?? toolInput.notebook_path ?? "");

if (event === "PreToolUse" && ["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(toolName)) {
  if (/src\/integrations\/supabase\/(client|types)\.ts$/.test(filePath)) {
    block("⛔ Fichier auto-généré par Supabase, ne pas éditer : " + filePath);
  }
  process.exit(0);
}

if (event === "PostToolUse" && ["Edit", "Write", "MultiEdit"].includes(toolName)) {
  if (/supabase\/functions\//.test(filePath) && !/_test\.ts$/.test(filePath)) {
    block(
      "ℹ️ Rappel : modifier supabase/functions/ ne change rien en prod tant que la fonction " +
      "n'est pas redéployée (MCP Supabase, voir supabase/functions/CLAUDE.md). " +
      "Vérifier ensuite la version avec get_edge_function."
    );
  }
  process.exit(0);
}

process.exit(0);

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data || "{}"));
  });
}
