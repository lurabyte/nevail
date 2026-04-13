import { loadJson } from "./utils.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LanguageDict {
  [key: string]: string;
}

class I18n {
  private englishDict: LanguageDict = {};
  private currentLanguageDict: LanguageDict = {};
  private langDir: string;

  constructor(langDir: string = path.join(__dirname, "../configurator.lang")) {
    this.langDir = langDir;
  }

  async initialize(language: string = "en"): Promise<void> {
    try {
      this.englishDict = await loadJson<LanguageDict>(
        path.join(this.langDir, "en.json"),
      );
      this.currentLanguageDict = { ...this.englishDict };

      if (language !== "en") {
        try {
          const langDict = await loadJson<LanguageDict>(
            path.join(this.langDir, `${language}.json`),
          );
          this.currentLanguageDict = { ...this.englishDict, ...langDict };
        } catch (error) {
          console.warn(
            `Language file not found for '${language}', falling back to English`,
          );
        }
      }
    } catch (error) {
      console.error("Failed to load English language file:", error);
      throw new Error("Failed to initialize i18n");
    }
  }

  async setLanguage(language: string): Promise<void> {
    try {
      const langDict = await loadJson<LanguageDict>(
        path.join(this.langDir, `${language}.json`),
      );
      this.currentLanguageDict = { ...this.englishDict, ...langDict };
    } catch (error) {
      throw new Error(`Language file not found: ${language}`);
    }
  }

  translate(key: string): string {
    return this.currentLanguageDict[key] ?? this.englishDict[key] ?? key;
  }

  _(key: string): string {
    return this.translate(key);
  }

  async getAvailableLanguages(): Promise<string[]> {
    try {
      const fsModule = await import("fs/promises");
      const files = await fsModule.readdir(this.langDir);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""));
    } catch {
      return ["en"];
    }
  }
}

export const i18n = new I18n();
export default i18n;
