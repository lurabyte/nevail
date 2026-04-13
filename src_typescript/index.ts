import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

function getVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, "../package.json");
    const content = readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content) as PackageJson;
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const version = getVersion();

  if (!command || command === "--help" || command === "-h") {
    console.log("Nevail - Build desktop applications using Firefox");
    console.log("");
    console.log("Usage: nevail <command> [options]");
    console.log("");
    console.log("Commands:");
    console.log("  configurator      Interactive configuration wizard");
    console.log("  pwa               Convert PWA manifest to Nevail config");
    console.log("  build             Build from existing config");
    console.log("");
    console.log("Options:");
    console.log("  --version         Show version number");
    console.log("  --help            Show help");
    console.log("");
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(version);
    process.exit(0);
  }

  if (command === "configurator" || command === "config") {
    process.argv.splice(2, 1);
    const { main: runConfigurator } = await import("./configurator.js");
    await runConfigurator();
  } else if (command === "pwa" || command === "pwa-configurator") {
    process.argv.splice(2, 1);
    const { main: runPwa } = await import("./pwa_configurator.js");
    await runPwa();
  } else if (command === "build") {
    process.argv.splice(2, 1);
    const { main: runBuild } = await import("./build.js");
    await runBuild();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run with --help for usage information");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
