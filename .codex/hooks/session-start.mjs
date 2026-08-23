#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const lockfile = join(root, "package-lock.json");
const cachedLockfile = join(root, "node_modules", ".package-lock.json.codex-cache");

const dependenciesAreCurrent =
  existsSync(join(root, "node_modules")) &&
  existsSync(cachedLockfile) &&
  readFileSync(lockfile).equals(readFileSync(cachedLockfile));

if (dependenciesAreCurrent) {
  process.stdout.write("Dépendances npm déjà à jour.\n");
  process.exit(0);
}

// Une branche non revue peut modifier le lockfile : ne jamais exécuter ses scripts
// lifecycle automatiquement au démarrage de Codex.
const result = spawnSync("npm", ["ci", "--ignore-scripts"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "npm ci a échoué.\n");
  process.exit(result.status ?? 1);
}

copyFileSync(lockfile, cachedLockfile);
process.stdout.write("Dépendances installées avec npm ci --ignore-scripts.\n");
