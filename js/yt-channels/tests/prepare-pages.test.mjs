import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { preparePages } from "../prepare-pages.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const configPath = join(projectRoot, "js", "yt-channels", "config.js");

async function temporaryRun(run) {
    const directory = await mkdtemp(join(tmpdir(), "m3u-pages-test-"));
    try { await run(directory); }
    finally {
        // Delete only the exact temporary directory created by this test.
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert.ok(directory.includes("m3u-pages-test-"));
        await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
}

async function filesUnder(directory) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await filesUnder(path));
        else files.push(path);
    }
    return files;
}

test("deployment generates a runnable site config without changing source or publishing repository internals", () => temporaryRun(async directory => {
    const sourceBefore = await readFile(configPath, "utf8");
    const output = join(directory, "site");
    const browserKey = 'fixture-key-with-quote"-backslash\\-and-newline\n${not_code}';
    await preparePages({ outputDir: output, apiKey: browserKey });
    assert.equal(await readFile(configPath, "utf8"), sourceBefore);
    const generated = await readFile(join(output, "js", "yt-channels", "config.js"), "utf8");
    const config = await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
    assert.equal(config.youtubeChannelsConfig.apiKey, browserKey);
    assert.equal(config.youtubeChannelsConfig.videoLimit, 12);
    assert.equal(config.youtubeChannelsConfig.cacheMs, 600000);
    for (const name of ["index.html", "manifest.json", "icon.svg", "data/trending.json", ".nojekyll", "js/yt-channels/style.css"]) {
        await access(join(output, name));
    }
    for (const name of [".git", ".github", ".claude", "CLAUDE.md", "documents", "scripts", "js/yt-channels/tests", "js/yt-channels/README.md", "js/yt-channels/prepare-pages.mjs"]) {
        await assert.rejects(access(join(output, name)), { code: "ENOENT" });
    }
    // Every relative module import in the deployment must resolve inside it.
    for (const file of await filesUnder(join(output, "js"))) {
        if (!file.endsWith(".js")) continue;
        const source = await readFile(file, "utf8");
        for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.\.?\/[^"']+)["']/g)) {
            await access(resolve(dirname(file), match[1]));
        }
    }
}));

test("missing secrets fail before creating any deployment files", () => temporaryRun(async directory => {
    const output = join(directory, "site");
    await assert.rejects(preparePages({ outputDir: output, apiKey: "  " }), /YT_BROWSER_API_KEY is missing/);
    await assert.rejects(access(output), { code: "ENOENT" });
}));

test("packaging refuses source paths and preserves nonempty output", () => temporaryRun(async directory => {
    for (const outputDir of [projectRoot, dirname(projectRoot), join(projectRoot, "js", "generated")]) {
        await assert.rejects(preparePages({ outputDir, apiKey: "fixture-key" }), /source director/);
    }
    const outputDir = join(directory, "site");
    await mkdir(outputDir);
    await writeFile(join(outputDir, "keep.txt"), "keep");
    await assert.rejects(preparePages({ outputDir, apiKey: "fixture-key" }), /new or empty/);
    assert.equal(await readFile(join(outputDir, "keep.txt"), "utf8"), "keep");
}));

test("tracked config must stay empty rather than silently copying an embedded credential", () => temporaryRun(async directory => {
    const sourceRoot = join(directory, "source");
    const outputDir = join(directory, "site");
    await mkdir(join(sourceRoot, "js", "yt-channels"), { recursive: true });
    await writeFile(join(sourceRoot, "js", "yt-channels", "config.js"), 'export const youtubeChannelsConfig = { apiKey: "already-set" };');
    await assert.rejects(preparePages({ sourceRoot, outputDir, apiKey: "fixture-key" }), /Keep apiKey empty/);
    await assert.rejects(access(outputDir), { code: "ENOENT" });
}));

test("the deployment command reads the named environment secret and never prints its value", () => temporaryRun(async directory => {
    const browserKey = "fixture-browser-value-for-cli";
    const command = join(projectRoot, "js", "yt-channels", "prepare-pages.mjs");
    const result = spawnSync(process.execPath, [command, join(directory, "site")], {
        encoding: "utf8", env: { ...process.env, YT_BROWSER_API_KEY: browserKey }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Prepared the Pages artifact/);
    assert.ok(!(result.stdout + result.stderr).includes(browserKey));
    const generated = await readFile(join(directory, "site", "js", "yt-channels", "config.js"), "utf8");
    assert.ok(generated.includes(browserKey));
    const missing = spawnSync(process.execPath, [command, join(directory, "missing")], {
        encoding: "utf8", env: { ...process.env, YT_BROWSER_API_KEY: "" }
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /YT_BROWSER_API_KEY is missing/);
}));
