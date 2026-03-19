import fs from "node:fs";
import path from "node:path";
import { businessConfigSchema, type BusinessConfig } from "./schema.js";

export function loadBusinessConfig(): BusinessConfig {
  const configPath = path.join(process.cwd(), "config", "business.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  const result = businessConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid business config at ${configPath}: ${result.error.message}`
    );
  }

  return result.data;
}
