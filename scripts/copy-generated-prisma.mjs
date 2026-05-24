import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "..");
const sourceDir = resolve(projectRoot, "src/generated/prisma");
const targetDir = resolve(projectRoot, "dist/generated/prisma");

if (!existsSync(sourceDir)) {
  throw new Error(`Prisma client source directory not found: ${sourceDir}`);
}

rmSync(targetDir, { force: true, recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
