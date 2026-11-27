// Deployment packaging only: no app build step or external dependencies.
// Write the browser credential into an artifact, never into tracked source.
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const keyPlaceholder = /^(\s*apiKey\s*:\s*)""(?=\s*[,\n\r}])/m;

function containsPath(parent, child) {
    const path = relative(parent, child);
    return !path || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function copyRuntimeDirectory(source, destination, extensions) {
    if (!(await lstat(source)).isDirectory()) throw new Error("Runtime source folders must be regular directories.");
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "tests") continue;
        const from = join(source, entry.name);
        const to = join(destination, entry.name);
        if (entry.isSymbolicLink()) throw new Error("Runtime files must not be symbolic links.");
        if (entry.isDirectory()) await copyRuntimeDirectory(from, to, extensions);
        else if (entry.isFile() && extensions.has(extname(entry.name))) await copyFile(from, to);
    }
}

export async function preparePages({ sourceRoot = projectRoot, outputDir = join(projectRoot, "_site"), apiKey } = {}) {
    const browserKey = String(apiKey || "").trim();
    if (!browserKey) {
        throw new Error("Repository secret YT_BROWSER_API_KEY is missing or empty. Add it under Settings > Secrets and variables > Actions, then rerun Deploy M3U Player.");
    }
    const source = resolve(sourceRoot);
    const output = resolve(outputDir);
    // Reject the source itself and its ancestors; do not delete existing output.
    if (containsPath(output, source)) {
        throw new Error("The site output must not overwrite the source directory.");
    }
    for (const directory of ["js", "css", "data"]) {
        const runtimeRoot = join(source, directory);
        if (containsPath(runtimeRoot, output)) {
            throw new Error("The site output must be outside runtime source directories.");
        }
    }
    try {
        if ((await readdir(output)).length) throw new Error("Use a new or empty site output directory.");
    } catch (error) { if (error.code !== "ENOENT") throw error; }

    const configSource = await readFile(join(source, "js", "yt-channels", "config.js"), "utf8");
    if (!keyPlaceholder.test(configSource)) {
        throw new Error("Keep apiKey empty in the tracked js/yt-channels/config.js; the deployment reads YT_BROWSER_API_KEY instead.");
    }
    await mkdir(output, { recursive: true });
    for (const name of ["index.html", "manifest.json", "icon.svg"]) {
        if (!(await lstat(join(source, name))).isFile()) throw new Error("Site entry files must be regular files.");
        await copyFile(join(source, name), join(output, name));
    }
    await copyRuntimeDirectory(join(source, "css"), join(output, "css"), new Set([".css"]));
    await copyRuntimeDirectory(join(source, "js"), join(output, "js"), new Set([".js", ".css"]));
    await mkdir(join(output, "data"), { recursive: true });
    if (!(await lstat(join(source, "data"))).isDirectory()) throw new Error("The data folder must be a regular directory.");
    if (!(await lstat(join(source, "data", "trending.json"))).isFile()) throw new Error("The trends snapshot must be a regular file.");
    await copyFile(join(source, "data", "trending.json"), join(output, "data", "trending.json"));

    const generatedConfig = configSource.replace(keyPlaceholder, (_match, prefix) => prefix + JSON.stringify(browserKey));
    await writeFile(join(output, "js", "yt-channels", "config.js"),
        "// Generated from YT_BROWSER_API_KEY for the deployed browser app.\n" + generatedConfig, "utf8");
    await writeFile(join(output, ".nojekyll"), "", "utf8");
    try {
        const cname = join(source, "CNAME");
        if (!(await lstat(cname)).isFile()) throw new Error("CNAME must be a regular file.");
        await copyFile(cname, join(output, "CNAME"));
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await preparePages({ apiKey: process.env.YT_BROWSER_API_KEY,
            outputDir: process.argv[2] ? resolve(process.argv[2]) : join(projectRoot, "_site") });
        console.log("Prepared the Pages artifact with the YouTube browser configuration. Source files are unchanged.");
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
