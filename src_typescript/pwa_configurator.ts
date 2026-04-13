import { Command } from "commander";
import axios from "axios";
import path from "path";
//import { fileURLToPath } from "url";
import { sanitize, saveJson, ensureDir } from "./utils.js";
import { writeFile, rm } from "fs/promises";

//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);

export interface AppConfig {
  appName: string;
  internalAppName: string;
  url: string;
  logoSvgFilePath: string;
  platforms: string[];
  extensionURLs: string[];
  version: string;
  author: string;
  projectDescription: string;
  projectURL: string;
  projectHelpURL: string;
  openInDefaultBrowser: boolean;
  openInDefaultBrowserRegex?: string;
  runInBackground: boolean;
}

interface PWAIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

interface PWAManifest {
  name?: string;
  short_name?: string;
  start_url: string;
  scope?: string;
  scope_extensions?: Array<{ type: string; origin: string }>;
  icons: PWAIcon[];
  display: string;
  [key: string]: unknown;
}

async function fetchManifest(manifestUrl: string): Promise<PWAManifest> {
  try {
    const response = await axios.get<PWAManifest>(manifestUrl);
    return response.data;
  } catch (error) {
    throw new Error(
      `Failed to fetch manifest from ${manifestUrl}: ${(error as Error).message}`,
    );
  }
}

function getBaseDir(url: string): string {
  return url.split("/").slice(0, -1).join("/");
}

function constructFullUrl(baseDir: string, relativePath: string): string {
  if (
    relativePath.startsWith("http://") ||
    relativePath.startsWith("https://")
  ) {
    return relativePath;
  }
  if (relativePath.startsWith("/")) {
    const urlObj = new URL(baseDir);
    return `${urlObj.protocol}//${urlObj.host}${relativePath}`;
  }
  return `${baseDir}/${relativePath}`;
}

function selectBestIcon(icons: PWAIcon[]): PWAIcon | null {
  if (icons.length === 0) return null;

  let bestCandidate: PWAIcon | null = null;
  let bestSize = 0;
  let isSvg = false;

  for (const icon of icons) {
    if (icon.src.endsWith(".svg")) {
      isSvg = true;
      bestCandidate = icon;
      break;
    }

    if (icon.sizes) {
      const sizes = icon.sizes.split(" ");
      let highestSize = 0;

      for (const size of sizes) {
        const [width] = size.split("x");
        const sizeNum = parseInt(width, 10);
        if (sizeNum > highestSize) {
          highestSize = sizeNum;
        }
      }

      if (highestSize > bestSize && !isSvg) {
        bestCandidate = icon;
        bestSize = highestSize;
      }
    }

    if (bestCandidate === null && icon.src.endsWith(".png")) {
      bestCandidate = icon;
    }

    if (bestCandidate === null) {
      bestCandidate = icon;
    }
  }

  return bestCandidate;
}

async function downloadIcon(url: string, outputPath: string): Promise<void> {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    await writeFile(outputPath, response.data);
  } catch (error) {
    throw new Error(
      `Failed to download icon from ${url}: ${(error as Error).message}`,
    );
  }
}

async function downloadSvgIcon(url: string, outputPath: string): Promise<void> {
  try {
    const response = await axios.get(url, { responseType: "text" });
    await writeFile(outputPath, response.data, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to download SVG icon from ${url}: ${(error as Error).message}`,
    );
  }
}

async function convertImageToSvg(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  try {
    const { execSync } = await import("child_process");
    try {
      execSync(`potrace -s "${inputPath}" -o "${outputPath}"`, {
        stdio: "pipe",
      });
      console.log("Icon converted to SVG using potrace");
      return;
    } catch {
      console.warn("potrace not found. Image will be kept as-is.");
      console.warn("Install potrace: sudo apt install potrace");

      const sharp = await import("sharp");
      await sharp.default(inputPath).toFile(outputPath.replace(".svg", ".png"));
      console.warn(
        `Saved as PNG instead: ${outputPath.replace(".svg", ".png")}`,
      );
    }
  } catch (error) {
    console.warn(`Could not convert image to SVG: ${(error as Error).message}`);
  }
}

export async function main(): Promise<void> {
  const program = new Command();

  program
    .name("pwa-configurator")
    .description("Generate Nevail config from PWA manifest")
    .argument("<manifest>", "URL of PWA manifest.json file")
    .argument("<output>", "Output directory for config and icon")
    .parse(process.argv);

  const [manifestUrl, outputDir] = program.args;

  console.log("Fetching PWA manifest...");
  const manifest = await fetchManifest(manifestUrl);

  const baseDir = getBaseDir(manifestUrl);
  const config: AppConfig = {
    appName: sanitize(manifest.name || manifest.short_name || "PWA", false),
    internalAppName: sanitize(
      manifest.short_name || manifest.name || "pwa",
    ).toLowerCase(),
    url: constructFullUrl(baseDir, manifest.start_url),
    version: "1.0.0",
    author: "undefined",
    projectDescription: "undefined",
    projectURL: "undefined",
    projectHelpURL: "undefined",
    openInDefaultBrowser: false,
    openInDefaultBrowserRegex: "",
    runInBackground: true,
    platforms: [
      "linux",
      "deb",
      "appimage",
      "linux-aarch64",
      "appimage-aarch64",
      "deb-aarch64",
      "flatpak",
      "windows",
      "mac-arm",
      "mac-intel",
    ],
    logoSvgFilePath: `../${outputDir}/icon.svg`,
    extensionURLs: [],
  };

  const scopes: string[] = [];
  if (manifest.scope) {
    scopes.push(manifest.scope.replace(/https?:\/\//g, "http[s]?://"));
  }

  if (manifest.scope_extensions) {
    for (const ext of manifest.scope_extensions) {
      if (ext.type === "origin") {
        scopes.push(ext.origin.replace(/https?:\/\//g, "http[s]?://"));
      }
    }
  }

  config.openInDefaultBrowser = scopes.length > 0;
  config.openInDefaultBrowserRegex = scopes.join("|");

  if (manifest.display && manifest.display !== "standalone") {
    console.warn(
      `PWA display mode "${manifest.display}" is not "standalone". Nevail only supports standalone mode.`,
    );
  }

  const supportedKeys = [
    "name",
    "short_name",
    "start_url",
    "scope",
    "scope_extensions",
    "icons",
    "display",
  ];
  for (const key of Object.keys(manifest)) {
    if (!supportedKeys.includes(key)) {
      console.warn(
        `PWA manifest property "${key}" is not supported in Nevail. Skipping...`,
      );
    }
  }

  await ensureDir(outputDir);

  console.log("Generating config.json...");
  await saveJson(path.join(outputDir, "config.json"), config, true);

  console.log("Processing icon...");
  const bestIcon = selectBestIcon(manifest.icons);

  if (bestIcon) {
    const iconUrl = constructFullUrl(baseDir, bestIcon.src);
    const isSvg = bestIcon.src.endsWith(".svg");

    if (isSvg) {
      console.log("Downloading SVG icon...");
      await downloadSvgIcon(iconUrl, path.join(outputDir, "icon.svg"));
    } else {
      const filename = bestIcon.src.split("/").pop() || "icon.png";
      const tempPath = path.join(outputDir, filename);
      const svgPath = path.join(outputDir, "icon.svg");

      console.log("Downloading raster icon...");
      await downloadIcon(iconUrl, tempPath);

      console.log("Converting image to SVG...");
      await convertImageToSvg(tempPath, svgPath);

      try {
        await rm(tempPath);
      } catch {}
    }
  } else {
    console.warn("No suitable icon found in manifest");
  }

  console.log(`\nDone! Configuration saved to ${outputDir}/`);
  console.log("\nTo build, run:");
  console.log(
    `  npx ts-node configurator.ts -c ${path.join(outputDir, "config.json")} -b`,
  );
}
