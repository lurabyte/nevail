import { Command } from "commander";
import * as readline from "readline";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  sanitize,
  saveJson,
  copyDir,
  dirExists,
  removeDir,
  ensureDir,
} from "./utils.js";
import i18n from "./i18n.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function validatePlatforms(input: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(`[${input.toLowerCase()}]`);
    if (!Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(i18n._("ERR-INVALID-PLATFORM"));
  }
}

async function validateExtensionUrls(input: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(`[${input}]`);
    if (!Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(i18n._("ERR-INVALID-EXTENSION-URL"));
  }
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

async function interactiveConfig(rl: readline.Interface): Promise<AppConfig> {
  const config: AppConfig = {
    appName: "",
    internalAppName: "",
    url: "",
    logoSvgFilePath: "",
    platforms: [],
    extensionURLs: [],
    version: "",
    author: "",
    projectDescription: "",
    projectURL: "",
    projectHelpURL: "",
    openInDefaultBrowser: false,
    runInBackground: false,
  };

  config.appName = sanitize(await question(rl, i18n._("INPUT-APPNAME")), false);
  config.internalAppName = sanitize(config.appName).toLowerCase();
  config.url = await question(rl, i18n._("INPUT-APP-URL"));
  config.logoSvgFilePath = path.resolve(
    await question(rl, i18n._("INPUT-LOGOSVG-PATH")),
  );

  while (true) {
    try {
      const platformsInput = await question(
        rl,
        i18n._("INPUT-BUILD-PLATFORMS"),
      );
      config.platforms = await validatePlatforms(platformsInput);
      break;
    } catch (error) {
      console.error((error as Error).message);
    }
  }

  const installExtensions = (
    await question(rl, i18n._("INPUT-IS-EXTENSION-INSTALLED"))
  ).toLowerCase();
  if (["yes", "y"].includes(installExtensions)) {
    try {
      const extensionsInput = await question(
        rl,
        i18n._("INPUT-EXTENSION-URLS"),
      );
      config.extensionURLs = await validateExtensionUrls(extensionsInput);
    } catch (error) {
      console.error((error as Error).message);
      config.extensionURLs = [];
    }
  }

  config.version = await question(rl, i18n._("INPUT-VERSION"));
  config.author = sanitize(await question(rl, i18n._("INPUT-AUTHOR")));
  config.projectDescription = await question(rl, i18n._("INPUT-DESCRIPTION"));
  config.projectURL = await question(rl, i18n._("INPUT-PROJECT-URL"));
  config.projectHelpURL = await question(rl, i18n._("INPUT-PROJECT-HELP-URL"));

  while (true) {
    const answer = (
      await question(rl, i18n._("INPUT-ALLOW-OPEN-LINKS"))
    ).toLowerCase();
    if (["yes", "y"].includes(answer)) {
      config.openInDefaultBrowser = true;

      try {
        const { execSync } = await import("child_process");
        execSync("which web-ext", { stdio: "ignore" });
      } catch {
        console.warn(i18n._("WARN-MISSING-WEBEXT"));
      }

      while (true) {
        const regex = await question(rl, i18n._("INPUT-NOT-OPEN-LINKS-REGEX"));
        if (!isValidRegex(regex)) {
          console.error(i18n._("ERR-INVALID-REGEX"));
          continue;
        }
        try {
          const pattern = new RegExp(regex);
          if (!pattern.test(config.url)) {
            console.error(i18n._("ERR-REGEX-NOT-SELFREF"));
            continue;
          }
          config.openInDefaultBrowserRegex = regex;
          break;
        } catch {
          console.error(i18n._("ERR-INVALID-REGEX"));
        }
      }
      break;
    } else if (["no", "n"].includes(answer)) {
      config.openInDefaultBrowser = false;
      break;
    }
  }

  while (true) {
    const answer = (
      await question(rl, i18n._("INPUT-IS-RUN-BACKGROUND"))
    ).toLowerCase();
    if (["yes", "y"].includes(answer)) {
      config.runInBackground = true;
      break;
    } else if (["no", "n"].includes(answer)) {
      config.runInBackground = false;
      break;
    }
  }

  return config;
}

export async function main(): Promise<void> {
  const program = new Command();

  program
    .description("Configure and build Nevail applications")
    .option("-c, --config-file <path>", "Load config from existing JSON file")
    .option("-k, --keep-build-dir", "Keep existing build directory")
    .option("-l, --language <lang>", "Set UI language (en, sc, tc)", "en")
    .option("-b, --build", "Build the application after configuration")
    .option("-p, --platforms <list>", "Override platforms (comma-separated)")
    .parse(process.argv);

  const options = program.opts() as {
    configFile?: string;
    keepBuildDir?: boolean;
    language?: string;
    build?: boolean;
    platforms?: string;
  };

  await i18n.initialize(options.language || "en");

  const rl = createReadlineInterface();
  let appConfig: AppConfig;

  try {
    if (options.configFile) {
      try {
        const content = await fs.readFile(options.configFile, "utf-8");
        appConfig = JSON.parse(content);
      } catch (error) {
        console.error(`Failed to load config file: ${options.configFile}`);
        rl.close();
        process.exit(1);
      }
    } else {
      appConfig = await interactiveConfig(rl);
    }

    if (options.platforms) {
      appConfig.platforms = options.platforms
        .split(",")
        .map((p: string) => p.trim());
    }

    const buildDir = path.resolve(process.cwd(), "build");
    if (!options.keepBuildDir && (await dirExists(buildDir))) {
      console.log(i18n._("TIP-CLEAR-BUILD-FOLDER"));
      await removeDir(buildDir);
    }

    await ensureDir(buildDir);

    console.log("Copying files to build directory...");

    const projectRoot = path.resolve(__dirname, "..");
    const srcDir = path.join(projectRoot, "src");
    const buildSrcDir = path.join(buildDir, "src");

    try {
      await copyDir(srcDir, buildSrcDir);
      await saveJson(path.join(buildDir, "config.json"), appConfig, true);
    } catch (error) {
      console.error("Failed to copy files:", error);
      rl.close();
      process.exit(1);
    }

    if (options.build) {
      console.log("Starting build process...");
      try {
        const { buildApplication } = await import("./build.js");
        await buildApplication(appConfig, buildDir);
      } catch (error) {
        console.error("Build failed:", error);
        rl.close();
        process.exit(1);
      }
    } else {
      console.log(i18n._("TIP-DONE"));
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
