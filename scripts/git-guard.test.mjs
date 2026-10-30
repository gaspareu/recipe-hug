// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";

const hook = fileURLToPath(new URL("../.codex/hooks/git-guard.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "recipe-hug-guard-"));
const main = join(root, "main avec espaces");
const feature = join(root, "branche de travail");
for (const [directory, branch] of [[main, "main"], [feature, "codex/test"]]) {
  execFileSync("git", ["init", "--quiet", `--initial-branch=${branch}`, directory]);
}
afterAll(() => rmSync(root, { recursive: true, force: true }));

function check(command, cwd = feature) {
  // Le hook lit uniquement ce texte : aucune commande commit/push n'est exécutée.
  return spawnSync(process.execPath, [hook], {
    cwd,
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }),
  });
}

it.each(["commit -m test", "push", "push origin"])("bloque %s sur main avec un chemin entre guillemets", (operation) => {
  for (const path of [`"${main}"`, `'${main}'`, main.replaceAll(" ", "\\ ")]) {
    expect(check(`cd ${path} && git ${operation}`).status).toBe(2);
  }
});

it.each(["commit -m test", "push", "push origin"])("autorise %s sur une branche de travail avec un chemin entre guillemets", (operation) => {
  expect(check(`cd "${feature}" && git ${operation}`, main).status).toBe(0);
  expect(check(`cd '${feature}' && git ${operation}`, main).status).toBe(0);
});

it.each(["commit -m test", "push"])("bloque %s lorsque le répertoire est inconnu", (operation) => {
  const result = check(`cd "${root}/absent" && git ${operation}`);
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("déterminer la branche");
  expect(check(`git ${operation}`, root).status).toBe(2);
});

it.each(["commit -m test", "push"])("bloque %s si le chemin exige une expansion shell", (operation) => {
  expect(check(`cd "$HOME/projet" && git ${operation}`).status).toBe(2);
  expect(check(`cd $(pwd) && git ${operation}`).status).toBe(2);
});

it("conserve les protections des commandes sans cd", () => {
  expect(check("git commit -m test", main).status).toBe(2);
  expect(check("git push", main).status).toBe(2);
  expect(check("git commit -m test").status).toBe(0);
  expect(check("git push origin codex/test").status).toBe(0);
  expect(check("git push origin main").status).toBe(2);
  expect(check("git push --force origin codex/test").status).toBe(2);
});
