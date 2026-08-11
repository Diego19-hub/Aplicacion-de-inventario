import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationPattern = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)_(up|down)\.sql$/;
const migrationLikeSqlPattern = /^(\d+[_-]|.*_(?:up|down)\.sql$)/i;

export const defaultMigrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations"
);

export function parseMigrationFileName(fileName, directory = defaultMigrationsDirectory) {
  const match = migrationPattern.exec(fileName);

  if (!match) {
    throw new Error(`Nombre de migración inválido: ${fileName}.`);
  }

  const [, version, name, direction] = match;

  return {
    version,
    versionNumber: Number(version),
    name,
    direction,
    fileName,
    absolutePath: path.resolve(directory, fileName)
  };
}

export async function readMigrationDirectory(directory = defaultMigrationsDirectory) {
  const absoluteDirectory = path.resolve(directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const migrations = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    if (entry.name.endsWith(".sql") && !migrationPattern.test(entry.name)) {
      if (migrationLikeSqlPattern.test(entry.name)) {
        throw new Error(`Archivo SQL con formato de migración inválido: ${entry.name}.`);
      }

      continue;
    }

    if (migrationPattern.test(entry.name)) {
      migrations.push(parseMigrationFileName(entry.name, absoluteDirectory));
    }
  }

  return migrations;
}

async function checksumFile(absolutePath) {
  const content = await readFile(absolutePath);

  return createHash("sha256").update(content).digest("hex");
}

function validateMigrationFiles(files) {
  const byVersion = new Map();

  for (const file of files) {
    const entry = byVersion.get(file.versionNumber) ?? {
      version: file.version,
      versionNumber: file.versionNumber
    };

    if (entry[file.direction]) {
      throw new Error(`Versión de migración duplicada: ${file.version} (${file.direction}).`);
    }

    entry[file.direction] = file;
    byVersion.set(file.versionNumber, entry);
  }

  const versions = [...byVersion.keys()].sort((first, second) => first - second);

  if (versions.length === 0) {
    throw new Error("No se encontraron migraciones.");
  }

  if (versions[0] !== 1) {
    throw new Error("La secuencia de migraciones debe comenzar en 001.");
  }

  for (let index = 1; index < versions.length; index += 1) {
    if (versions[index] !== versions[index - 1] + 1) {
      throw new Error(
        `La secuencia de migraciones tiene un salto entre ${String(versions[index - 1]).padStart(3, "0")} y ${String(versions[index]).padStart(3, "0")}.`
      );
    }
  }

  for (const version of versions) {
    const entry = byVersion.get(version);

    if (!entry.up || !entry.down) {
      throw new Error(`La migración ${entry.version} debe tener archivos up y down.`);
    }

    if (entry.up.name !== entry.down.name) {
      throw new Error(`Los archivos up y down de ${entry.version} deben tener el mismo nombre lógico.`);
    }
  }

  return versions.map((version) => byVersion.get(version));
}

export async function getMigrationInventory(directory = defaultMigrationsDirectory) {
  const files = await readMigrationDirectory(directory);
  const validatedMigrations = validateMigrationFiles(files);

  return Promise.all(
    validatedMigrations.map(async (migration) => ({
      version: migration.version,
      versionNumber: migration.versionNumber,
      name: migration.up.name,
      up: {
        ...migration.up,
        checksum: await checksumFile(migration.up.absolutePath)
      },
      down: migration.down
    }))
  );
}
