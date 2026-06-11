import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_ENGINE_DIR = resolve(process.cwd(), "../lib/domain/matchmaker/v1");
const FUNCTIONS_ENGINE_DIR = resolve(process.cwd(), "src/matchmaker/v1");
const SOURCE_FILE_PATTERN = /^[A-Za-z0-9]+(?:[A-Za-z0-9])*\.ts$/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((fileName) => SOURCE_FILE_PATTERN.test(fileName))
    .sort();
}

function readSource(directory: string, fileName: string): string {
  return readFileSync(join(directory, fileName), "utf8").replace(/\r\n/g, "\n");
}

function normalizeRuntimeSource(source: string): string {
  return source
    .replaceAll("../../../../contracts/entityPlatform/", "<entityPlatform>/")
    .replaceAll("../../contracts/shared/entityPlatform/", "<entityPlatform>/");
}

function checksum(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function exportedNames(source: string): string[] {
  const names = new Set<string>();
  const declarationPattern =
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|type|interface|class|enum)\s+([A-Za-z0-9_]+)/gm;
  const namedExportPattern = /^export\s*\{([^}]+)\}/gm;

  for (const match of source.matchAll(declarationPattern)) {
    names.add(match[1]);
  }

  for (const match of source.matchAll(namedExportPattern)) {
    for (const rawName of match[1].split(",")) {
      const name = rawName.trim().split(/\s+as\s+/i).at(-1)?.trim();
      if (name) names.add(name);
    }
  }

  return [...names].sort();
}

describe("MatchMaker V1 Functions runtime mirror parity", () => {
  it("mirrors the root MatchMaker V1 source file inventory", () => {
    expect(sourceFiles(FUNCTIONS_ENGINE_DIR)).toEqual(sourceFiles(ROOT_ENGINE_DIR));
  });

  it("mirrors normalized source content for every runtime file", () => {
    for (const fileName of sourceFiles(ROOT_ENGINE_DIR)) {
      const rootSource = normalizeRuntimeSource(readSource(ROOT_ENGINE_DIR, fileName));
      const functionsSource = normalizeRuntimeSource(
        readSource(FUNCTIONS_ENGINE_DIR, fileName)
      );

      expect(checksum(functionsSource), fileName).toBe(checksum(rootSource));
    }
  });

  it("mirrors exported symbols for every runtime file", () => {
    for (const fileName of sourceFiles(ROOT_ENGINE_DIR)) {
      const rootSource = readSource(ROOT_ENGINE_DIR, fileName);
      const functionsSource = readSource(FUNCTIONS_ENGINE_DIR, fileName);

      expect(exportedNames(functionsSource), fileName).toEqual(
        exportedNames(rootSource)
      );
    }
  });

  it("documents the only allowed runtime mirror delta", () => {
    const rootRelative = relative(process.cwd(), ROOT_ENGINE_DIR);
    const functionsRelative = relative(process.cwd(), FUNCTIONS_ENGINE_DIR);

    expect(basename(rootRelative)).toBe("v1");
    expect(basename(functionsRelative)).toBe("v1");
    expect(normalizeRuntimeSource("../../../../contracts/entityPlatform/matchmaker")).toBe(
      normalizeRuntimeSource("../../contracts/shared/entityPlatform/matchmaker")
    );
  });
});
