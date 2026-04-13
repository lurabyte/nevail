import path from "path";
// import { fileURLToPath } from "url";
import { execSync } from "child_process";
import sharp from "sharp";
import { Command } from "commander";
import {
  loadJson,
  copyDir,
  ensureDir,
  fileExists,
  getCurrentDate,
} from "./utils.js";
import { writeFile, readFile } from "fs/promises";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

interface AppConfig {
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

function sanitize(s: string, replaceSpaces: boolean = true): string {
  let out = "";
  for (const c of s.trim()) {
    if (/[a-zA-Z0-9_]/.test(c)) {
      out += c;
    } else if (c === " " || c === "-") {
      if (replaceSpaces) {
        out += "_";
      } else {
        out += c;
      }
    }
  }
  return out.replace(/[\\/:*?"'<>|$()]/g, "_");
}

async function generatePngIcon(
  svgPath: string,
  outputPath: string,
  size: number,
): Promise<void> {
  try {
    await sharp(svgPath, { density: 300 })
      .resize(size, size, {
        fit: "cover",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toFile(outputPath);
    console.log(`Generated PNG: ${outputPath} (${size}x${size})`);
  } catch (error) {
    throw new Error(`Failed to generate PNG icon: ${(error as Error).message}`);
  }
}

async function generateIcoIcon(
  pngPath: string,
  outputPath: string,
  sizes: number[],
): Promise<void> {
  try {
    await sharp(pngPath)
      .resize(sizes[0], sizes[0])
      .toFile(outputPath.replace(".ico", ".png"));

    console.log("Note: ICO generation requires external tool. Saved as PNG.");
    console.log("Install ImageMagick: sudo apt install imagemagick");
    console.log(
      `Then run: convert ${outputPath.replace(".ico", ".png")} ${outputPath}`,
    );
  } catch (error) {
    console.warn(`Failed to generate ICO: ${(error as Error).message}`);
  }
}

async function generateIcnsIcon(
  svgPath: string,
  outputPath: string,
  size: number,
): Promise<void> {
  try {
    const tempPng = outputPath.replace(".icns", ".png");

    await sharp(svgPath, { density: 300 })
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(tempPng);

    console.log("Note: ICNS generation requires external tool.");
    console.log("Install png2icns: sudo apt install libimage-png-libpng-perl");
    console.log(`Then run: png2icns ${outputPath} ${tempPng}`);
  } catch (error) {
    throw new Error(
      `Failed to generate ICNS base: ${(error as Error).message}`,
    );
  }
}

function buildComponent(componentPath: string): boolean {
  try {
    console.log(`Building: ${componentPath}`);
    execSync(`bash ${componentPath}`, {
      stdio: "inherit",
      shell: "/bin/bash",
    });
    console.log(`Build successful: ${componentPath}`);
    return true;
  } catch (error) {
    console.error(`Build failed: ${componentPath}`);
    return false;
  }
}

async function replaceAllPlaceholders(
  files: string[],
  placeholders: { [key: string]: string },
): Promise<void> {
  for (const file of files) {
    try {
      if (!(await fileExists(file))) {
        console.warn(`File not found: ${file}`);
        continue;
      }

      let filename = path.basename(file);
      let filepath = file;

      for (const [placeholder, value] of Object.entries(placeholders)) {
        if (filename.includes(placeholder)) {
          const newFilename = filename.replace(
            new RegExp(placeholder, "g"),
            value,
          );
          const newPath = path.join(path.dirname(file), newFilename);
          filename = newFilename;
          filepath = newPath;
        }
      }

      let content = await readFile(file, "utf-8");
      for (const [placeholder, value] of Object.entries(placeholders)) {
        content = content
          .toString()
          .replace(new RegExp(placeholder, "g"), value);
      }

      await writeFile(filepath, content, "utf-8");

      if (filepath !== file) {
        const fsModule = await import("fs/promises");
        await fsModule.rename(file, filepath);
        console.log(
          `Renamed: ${path.basename(file)} -> ${path.basename(filepath)}`,
        );
      }
    } catch (error) {
      console.warn(
        `Error processing file ${file}: ${(error as Error).message}`,
      );
    }
  }
}

async function buildApplication(
  config: AppConfig,
  buildDir: string,
): Promise<void> {
  console.log("\nStarting Nevail application build...\n");

  config.internalAppName = sanitize(config.appName).toLowerCase();
  config.appName = sanitize(config.appName, false);
  config.author = sanitize(config.author, false);

  const brandingDir = path.join(
    buildDir,
    "src/changed/browser/branding",
    config.internalAppName,
  );

  console.log("Setting up branding...");
  const templateDir = path.join(buildDir, "src/branding-template");
  await copyDir(templateDir, brandingDir);

  const pngIcons: { [key: string]: number } = {
    [path.join(brandingDir, "default16.png")]: 16,
    [path.join(brandingDir, "default22.png")]: 22,
    [path.join(brandingDir, "default24.png")]: 24,
    [path.join(brandingDir, "default32.png")]: 32,
    [path.join(brandingDir, "default48.png")]: 48,
    [path.join(brandingDir, "default64.png")]: 64,
    [path.join(brandingDir, "default128.png")]: 128,
    [path.join(brandingDir, "default256.png")]: 256,
    [path.join(brandingDir, "VisualElements_70.png")]: 70,
    [path.join(brandingDir, "VisualElements_150.png")]: 150,
    [path.join(brandingDir, "msix/Assets/SmallTile.scale-200.png")]: 96,
    [path.join(brandingDir, "msix/Assets/LargeTile.scale-200.png")]: 256,
    [path.join(brandingDir, "msix/Assets/Square150x150Logo.scale-200.png")]:
      150,
    [path.join(
      brandingDir,
      "msix/Assets/Square44x44Logo.altform-lightunplated_targetsize-256.png",
    )]: 256,
    [path.join(
      brandingDir,
      "msix/Assets/Square44x44Logo.altform-unplated_targetsize-256.png",
    )]: 256,
    [path.join(brandingDir, "msix/Assets/Square44x44Logo.scale-200.png")]: 256,
    [path.join(brandingDir, "msix/Assets/Square44x44Logo.targetsize-256.png")]:
      256,
    [path.join(brandingDir, "msix/Assets/StoreLogo.scale-200.png")]: 256,
    [path.join(buildDir, "src/packages/appimage/nevail.AppImage/.DirIcon")]:
      256,
    [path.join(buildDir, "src/packages/appimage/nevail.AppImage/icon256.png")]:
      256,
    [path.join(
      buildDir,
      `src/packages/appimage/nevail.AppImage/usr/share/icons/${config.internalAppName}256.png`,
    )]: 256,
  };

  const icoIcons: { [key: string]: number[] } = {
    [path.join(brandingDir, "firefox64.ico")]: [
      256, 128, 64, 48, 32, 24, 22, 16,
    ],
    [path.join(brandingDir, "firefox.ico")]: [256, 128, 64, 48, 32, 24, 22, 16],
    [path.join(buildDir, `src/windows/${config.internalAppName}.ico`)]: [
      256, 128, 64, 48, 32, 24, 22, 16,
    ],
  };

  const icnsIcons: { [key: string]: number } = {
    [path.join(brandingDir, "firefox.icns")]: 512,
  };

  console.log("Generating PNG icons...");
  for (const [iconPath, size] of Object.entries(pngIcons)) {
    await ensureDir(path.dirname(iconPath));
    await generatePngIcon(config.logoSvgFilePath, iconPath, size);
  }

  console.log("Generating ICO icons...");
  const default256Path = path.join(brandingDir, "default256.png");
  for (const [iconPath, sizes] of Object.entries(icoIcons)) {
    await ensureDir(path.dirname(iconPath));
    await generateIcoIcon(default256Path, iconPath, sizes);
  }

  console.log("Generating ICNS icons...");
  for (const [iconPath, size] of Object.entries(icnsIcons)) {
    await ensureDir(path.dirname(iconPath));
    await generateIcnsIcon(config.logoSvgFilePath, iconPath, size);
  }

  console.log("Creating Windows banner...");
  const icon128Path = path.join(brandingDir, "default128.png");
  const bannerPath = path.join(buildDir, "src/windows/banner.bmp");
  await ensureDir(path.dirname(bannerPath));
  await sharp(icon128Path)
    .resize(164, 314, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toFile(bannerPath);

  const extIndex = config.extensionURLs.indexOf(
    "NEVAIL_OPEN_IN_DEFAULT_BROWSER_EXTENSION_LOCATION",
  );
  if (extIndex !== -1) {
    config.extensionURLs.splice(extIndex, 1);
  }

  const placeholderFiles = [
    path.join(brandingDir, "pref/firefox-branding.js"),
    path.join(brandingDir, "configure.sh"),
    path.join(brandingDir, "locales/en-US/brand.properties"),
    path.join(brandingDir, "locales/en-US/brand.dtd"),
    path.join(brandingDir, "locales/en-US/brand.ftl"),
    path.join(brandingDir, "branding.nsi"),
    path.join(buildDir, "src/changed/build/application.ini.in"),
    path.join(buildDir, "src/mozconfig.linux"),
    path.join(buildDir, "src/mozconfig.linux-aarch64"),
    path.join(buildDir, "src/mozconfig.windows"),
    path.join(buildDir, "src/mozconfig.mac-arm"),
    path.join(buildDir, "src/mozconfig.mac-intel"),
    path.join(buildDir, "src/mozconfig.flatpak"),
    path.join(buildDir, "src/scripts/build/launch-app-linux"),
    path.join(buildDir, "src/scripts/build/launch-app-linux-aarch64"),
    path.join(buildDir, "src/scripts/build/launch-app-windows"),
    path.join(buildDir, "src/scripts/build/launch-app-mac-arm"),
    path.join(buildDir, "src/scripts/build/launch-app-mac-intel"),
    path.join(buildDir, "src/scripts/build/launch-app-flatpak"),
    path.join(buildDir, "src/windows/app.rc"),
    path.join(buildDir, "src/windows/setup.nsi"),
    path.join(buildDir, "src/mac/Info-aarch64.plist"),
    path.join(buildDir, "src/mac/Info-x86_64.plist"),
    path.join(buildDir, "src/patches/mozilla_dirsFromLibreWolf.patch"),
    path.join(buildDir, "src/patches/desktop_file_generator.patch"),
    path.join(buildDir, "src/distribution/policies-windows.json"),
    path.join(buildDir, "src/distribution/policies-linux.json"),
    path.join(buildDir, "src/distribution/policies-linux-appimage.json"),
    path.join(buildDir, "src/distribution/policies-flatpak.json"),
    path.join(buildDir, "src/scripts/build/linux"),
    path.join(buildDir, "src/scripts/build/linux-aarch64"),
    path.join(buildDir, "src/scripts/build/windows"),
    path.join(buildDir, "src/scripts/build/mac-arm"),
    path.join(buildDir, "src/scripts/build/mac-intel"),
    path.join(buildDir, "src/scripts/build/flatpak"),
    path.join(buildDir, "src/packages/appimage/nevail.AppImage/nevail.desktop"),
    path.join(buildDir, "src/packages/appimage/nevail.AppImage/AppRun"),
    path.join(buildDir, "src/packages/debian/install.in"),
    path.join(buildDir, "src/packages/debian/control.in"),
    path.join(buildDir, "src/packages/debian/distribution.ini"),
    path.join(
      buildDir,
      "src/packages/flatpak/io.github.NEVAIL_AUTHOR_STRIPPED.NEVAIL_APP_NAME_STRIPPED.yml",
    ),
    path.join(
      buildDir,
      "src/packages/flatpak/io.github.NEVAIL_AUTHOR_STRIPPED.NEVAIL_APP_NAME_STRIPPED.metainfo.xml",
    ),
    path.join(
      buildDir,
      "src/packages/flatpak/io.github.NEVAIL_AUTHOR_STRIPPED.NEVAIL_APP_NAME_STRIPPED.desktop",
    ),
    path.join(buildDir, "src/scripts/build/package-linux"),
    path.join(buildDir, "src/scripts/build/package-linux-aarch64"),
    path.join(buildDir, "src/scripts/build/package-appimage"),
    path.join(buildDir, "src/scripts/build/package-appimage-aarch64"),
    path.join(buildDir, "src/scripts/build/package-deb"),
    path.join(buildDir, "src/scripts/build/package-deb-aarch64"),
    path.join(buildDir, "src/scripts/build/package-windows"),
    path.join(buildDir, "src/scripts/build/package-mac-arm"),
    path.join(buildDir, "src/scripts/build/package-mac-intel"),
    path.join(buildDir, "src/scripts/build/package-flatpak"),
  ];

  const placeholders: { [key: string]: string } = {
    NEVAIL_INTERNAL_APP_NAME: config.internalAppName,
    NEVAIL_APP_NAME_STRIPPED: config.appName.replace(/ /g, ""),
    NEVAIL_APP_NAME: config.appName,
    NEVAIL_APP_URL: config.url,
    NEVAIL_PROJECT_URL: config.projectURL,
    NEVAIL_PROJECT_HELP_URL: config.projectHelpURL,
    NEVAIL_OPEN_IN_DEFAULT_BROWSER: String(
      config.openInDefaultBrowser,
    ).toLowerCase(),
    NEVAIL_SHOULD_RUN_IN_BACKGROUND: String(
      config.runInBackground,
    ).toLowerCase(),
    NEVAIL_APP_VERSION: config.version,
    NEVAIL_EXTENSION_URLS: JSON.stringify(config.extensionURLs),
    NEVAIL_SHOULD_OPEN_IN_DEFAULT_BROWSER: config.openInDefaultBrowser
      ? "1"
      : "0",
    NEVAIL_AUTHOR_STRIPPED: config.author.replace(/ /g, ""),
    NEVAIL_AUTHOR: config.author,
    NEVAIL_PROJECT_DESCRIPTION: config.projectDescription,
    NEVAIL_CURRENT_DATE: getCurrentDate(),
  };

  if (config.openInDefaultBrowser && config.openInDefaultBrowserRegex) {
    placeholderFiles.push(
      path.join(
        buildDir,
        "src/open-in-default-browser/open-in-default-browser-ext/extension/replaceLinks.js",
      ),
    );
    placeholders.NEVAIL_EXCLUDE_REGEX_PATTERN =
      config.openInDefaultBrowserRegex;
  }

  console.log("Replacing placeholders...");
  await replaceAllPlaceholders(placeholderFiles, placeholders);

  console.log("Determining build targets...");
  const buildablePlatforms: string[] = [];

  for (const platform of config.platforms) {
    switch (platform) {
      case "appimage":
        buildablePlatforms.push(
          "linux",
          "launch-app-linux",
          "package-appimage",
        );
        break;
      case "appimage-aarch64":
        buildablePlatforms.push(
          "linux-aarch64",
          "launch-app-linux-aarch64",
          "package-appimage-aarch64",
        );
        break;
      case "deb":
        buildablePlatforms.push("linux", "launch-app-linux", "package-deb");
        break;
      case "deb-aarch64":
        buildablePlatforms.push(
          "linux-aarch64",
          "launch-app-linux-aarch64",
          "package-deb-aarch64",
        );
        break;
      default:
        buildablePlatforms.push(platform);
        if (!platform.startsWith("launch-app-")) {
          buildablePlatforms.push(`launch-app-${platform}`);
          buildablePlatforms.push(`package-${platform}`);
        }
    }
  }

  const deduped = [...new Set(buildablePlatforms)];

  console.log(`\nBuild targets: ${deduped.join(", ")}\n`);

  const downloadScript = path.join(
    buildDir,
    "src/scripts/build/download-firefox-source",
  );
  if (!buildComponent(downloadScript)) {
    throw new Error("Failed to download Firefox source");
  }

  if (config.openInDefaultBrowser) {
    const extScript = path.join(
      buildDir,
      "src/scripts/build/open-in-default-browser",
    );
    if (!buildComponent(extScript)) {
      throw new Error("Failed to build open-in-default-browser extension");
    }
  }

  for (const component of deduped) {
    const scriptPath = path.join(buildDir, `src/scripts/build/${component}`);
    if (!buildComponent(scriptPath)) {
      throw new Error(`Failed to build component: ${component}`);
    }
  }

  console.log("\nBuild completed successfully!");
  console.log("Artifacts are in the build/ directory");
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .description("Build a Nevail application from config")
    .option("-d, --build-dir <path>", "Build directory", "./build")
    .parse(process.argv);

  const options = program.opts() as { buildDir: string };
  const buildDir = path.resolve(process.cwd(), options.buildDir);
  const configPath = path.join(buildDir, "config.json");

  const config = await loadJson<AppConfig>(configPath);
  await buildApplication(config, buildDir);
}

export { buildApplication, AppConfig, main };
