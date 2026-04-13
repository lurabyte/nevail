import fs from "fs/promises";
import { readFile, writeFile } from "fs/promises";

export function makeAlphanumeric(
  s: string,
  replaceSpaces: boolean = true,
): string {
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
  return out;
}

export function removeUnsafeCharacters(s: string): string {
  const unsafeChars = /[\\/:*?"'<>|$()]/g;
  return s.replace(unsafeChars, "_");
}

export function sanitize(s: string, replaceSpaces: boolean = true): string {
  return removeUnsafeCharacters(makeAlphanumeric(s.trim(), replaceSpaces));
}

export async function loadJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export async function saveJson<T>(
  filePath: string,
  data: T,
  pretty: boolean = true,
): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 4) : JSON.stringify(data);
  await writeFile(filePath, content, "utf-8");
}

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function removeDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function copyDir(
  source: string,
  destination: string,
): Promise<void> {
  await fs.cp(source, destination, { recursive: true });
}

export async function copyFile(
  source: string,
  destination: string,
): Promise<void> {
  await fs.copyFile(source, destination);
}

export async function listDir(dirPath: string): Promise<string[]> {
  return await fs.readdir(dirPath);
}

export function getCurrentDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

export async function replaceTextInFile(
  filePath: string,
  old: string,
  newText: string,
): Promise<void> {
  let content = await readFile(filePath, "utf-8");
  content = content.replace(new RegExp(escapeRegex(old), "g"), newText);
  await writeFile(filePath, content, "utf-8");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
