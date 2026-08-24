#!/usr/bin/env node
// Garde-fous Git et fichiers pour Codex (voir .agents/skills/git-github/SKILL.md).

import { execFileSync } from "node:child_process";

const input = JSON.parse(await readStdin());
const event = input.hook_event_name ?? "";
const toolName = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};
const command = String(toolInput.command ?? "");

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

function currentBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function editedPaths(patch) {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map(
    ([, filePath]) => filePath.trim(),
  );
}

if (event === "PreToolUse" && toolName === "Bash") {
  // Force push : interdit (sauf --force-with-lease, toléré hors main).
  if (/git\s+push\b/.test(command)) {
    const hasForce = /(^|\s)(--force|-f)(\s|$)/.test(command) && !/--force-with-lease/.test(command);
    if (hasForce) {
      block("⛔ git push --force interdit. Utiliser --force-with-lease, et uniquement sur ta propre branche de travail.");
    }
    // Push visant main/master explicitement, ou depuis main sans destination explicite.
    const targetsMain = /git\s+push\b[^|;&]*\s(origin\s+)?(main|master)(\s|:|$)/.test(command);
    const implicitFromMain = !/git\s+push\b[^|;&]*\s\S+\s+\S+/.test(command) && ["main", "master"].includes(currentBranch());
    if (targetsMain || implicitFromMain) {
      block("⛔ Push sur main interdit (auto-déployé sur Vercel). Pousser sur une branche et passer par une PR.");
    }
  }

  // Commit sur main : interdit.
  if (/git\s+commit\b/.test(command) && ["main", "master"].includes(currentBranch())) {
    block("⛔ Commit direct sur main interdit. Créer une branche codex/<sujet> avant de committer.");
  }

  process.exit(0);
}

if (event === "PreToolUse" && toolName === "apply_patch") {
  const protectedPath = editedPaths(command).find((filePath) =>
    /src\/integrations\/supabase\/(client|types)\.ts$/.test(filePath),
  );
  if (protectedPath) {
    block(`⛔ Fichier auto-généré par Supabase, ne pas éditer : ${protectedPath}`);
  }
  process.exit(0);
}

if (event === "PostToolUse" && toolName === "apply_patch") {
  const touchesEdgeFunction = editedPaths(command).some(
    (filePath) =>
      /supabase\/functions\//.test(filePath) && !/_test\.ts$/.test(filePath),
  );

  if (touchesEdgeFunction) {
    const message =
      "ℹ️ Modifier supabase/functions/ ne change pas la production avant le redéploiement. " +
      "Suivre supabase/functions/AGENTS.md puis vérifier la nouvelle version de la fonction.";
    process.stdout.write(
      JSON.stringify({
        systemMessage: message,
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: message,
        },
      }),
    );
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data || "{}"));
  });
}
