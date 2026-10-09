// Get or update the `data` branch (written by the GitHub Actions data job) into ./data/branch.
// Uses this repo's own origin, so it works on any machine that can `git pull` this repo.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { stdio: "inherit" });
const dir = "data/branch";
if (existsSync(`${dir}/.git`)) {
  git("-C", dir, "fetch", "--depth", "1", "origin", "data");
  git("-C", dir, "reset", "--hard", "FETCH_HEAD");
} else {
  const url = execFileSync("git", ["remote", "get-url", "origin"]).toString().trim();
  git("clone", "--depth", "1", "--branch", "data", url, dir);
}
console.log("data branch ready in", dir);
