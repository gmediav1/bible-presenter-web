import { existsSync, readFileSync } from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { resolve } from "node:path"

const projectRoot = resolve(import.meta.dirname, "..")
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"))
const version = packageJson.version
const tag = `v${version}`
const releaseDirectory = resolve(projectRoot, "release")
const assets = [
  `Bible-Presenter-Setup-${version}.exe`,
  `Bible-Presenter-Setup-${version}.exe.blockmap`,
  "latest.yml"
].map((file) => resolve(releaseDirectory, file))

for (const asset of assets) {
  if (!existsSync(asset)) throw new Error(`Update-Datei fehlt: ${asset}\nFühre zuerst npm run package:win:update aus.`)
}

const runGh = (argumentsList) => execFileSync("gh", argumentsList, { cwd: projectRoot, stdio: "inherit" })

const existingRelease = spawnSync("gh", ["release", "view", tag, "--repo", "gmediav1/bible-presenter-web"], {
  cwd: projectRoot,
  stdio: "ignore"
})

if (existingRelease.status === 0) {
  runGh(["release", "upload", tag, ...assets, "--clobber", "--repo", "gmediav1/bible-presenter-web"])
} else {
  runGh([
    "release", "create", tag, ...assets,
    "--repo", "gmediav1/bible-presenter-web",
    "--title", `Bible Presenter ${version}`,
    "--notes", "Automatisches Windows-Update."
  ])
}

console.log(`GitHub-Update ${tag} wurde mit Installer, latest.yml und Blockmap veröffentlicht.`)
