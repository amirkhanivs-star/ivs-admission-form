import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

const STATIC_FILES = [
  "index.html",
  "styles.css",
  "script.js",
  "google.html"
];

const STATIC_DIRS = [
  "img"
];

// Sensitive items that MUST NEVER exist in public/
const FORBIDDEN_NAMES = [
  ".env",
  ".env.example",
  ".env.local",
  "server.js",
  "package.json",
  "package-lock.json",
  ".package-lock.json",
  "admissions.json",
  "admissions.json.bak",
  "admissions.json.tmp",
  "vercel.json"
];

export function buildPublic() {
  console.log("[Build] Publishing static assets to public/ directory for Vercel CDN delivery...");

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Copy root frontend files
  for (const fileName of STATIC_FILES) {
    const src = path.join(rootDir, fileName);
    const dest = path.join(publicDir, fileName);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      const stats = fs.statSync(dest);
      console.log(`[Build] Copied ${fileName} (${stats.size} bytes) -> public/${fileName}`);
    } else {
      console.warn(`[Build] Warning: Source file ${fileName} not found in root.`);
    }
  }

  // Copy static directories (img)
  for (const dirName of STATIC_DIRS) {
    const srcDir = path.join(rootDir, dirName);
    const destDir = path.join(publicDir, dirName);
    if (fs.existsSync(srcDir)) {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.cpSync(srcDir, destDir, { recursive: true });
      console.log(`[Build] Synchronized directory ${dirName}/ -> public/${dirName}/`);
    }
  }

  // Security verification: ensure no forbidden or sensitive files leaked into public/
  for (const forbidden of FORBIDDEN_NAMES) {
    const forbiddenPath = path.join(publicDir, forbidden);
    if (fs.existsSync(forbiddenPath)) {
      fs.rmSync(forbiddenPath, { recursive: true, force: true });
      throw new Error(`[Security Alert] Forbidden file "${forbidden}" detected in public/ and was removed.`);
    }
  }

  // Ensure data directory never leaked
  const forbiddenDataDir = path.join(publicDir, "data");
  if (fs.existsSync(forbiddenDataDir)) {
    fs.rmSync(forbiddenDataDir, { recursive: true, force: true });
    throw new Error("[Security Alert] Forbidden data directory detected in public/ and was removed.");
  }

  console.log("[Build] Static asset delivery build completed successfully.");
}

// Execute if run directly via CLI
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  buildPublic();
}
