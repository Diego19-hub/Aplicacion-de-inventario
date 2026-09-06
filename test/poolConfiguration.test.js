import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const poolInspector = `
  import("./db/pool.js")
    .then(async ({ default: pool }) => {
      process.stdout.write(JSON.stringify({ ssl: pool.options.ssl }));
      await pool.end();
    })
    .catch((error) => {
      process.stderr.write(error.message);
      process.exitCode = 1;
    });
`;

function inspectPool(overrides = {}) {
  const environment = {
    ...process.env,
    DATABASE_URL: "postgresql://localhost/inventory_test",
    NODE_ENV: "production"
  };

  for (const name of [
    "DATABASE_SSL",
    "DATABASE_SSL_CA",
    "PGSSLROOTCERT",
    "DATABASE_TRUST_PRIVATE_NETWORK"
  ]) {
    delete environment[name];
  }

  Object.assign(environment, overrides);

  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", poolInspector],
    { cwd: process.cwd(), encoding: "utf8", env: environment }
  );

  return {
    status: result.status,
    stderr: result.stderr ?? "",
    ...(result.status === 0
      ? { value: JSON.parse(result.stdout.trim().split("\n").at(-1)) }
      : {})
  };
}

test("producción exige una CA y valida el certificado cuando DATABASE_SSL=true", () => {
  const result = inspectPool({
    DATABASE_SSL: "true",
    DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\nprivate-network-ca\n-----END CERTIFICATE-----"
  });

  assert.equal(result.status, 0);
  assert.equal(result.value.ssl.rejectUnauthorized, true);
  assert.equal(result.value.ssl.ca, "-----BEGIN CERTIFICATE-----\nprivate-network-ca\n-----END CERTIFICATE-----");

  const withoutCa = inspectPool({ DATABASE_SSL: "true" });
  assert.notEqual(withoutCa.status, 0);
  assert.match(
    withoutCa.stderr,
    /La producción requiere DATABASE_SSL_CA o PGSSLROOTCERT/
  );
});

test("producción permite desactivar TLS solo con la confirmación de red privada", () => {
  const result = inspectPool({
    DATABASE_SSL: "false",
    DATABASE_TRUST_PRIVATE_NETWORK: "true"
  });

  assert.equal(result.status, 0);
  assert.equal(result.value.ssl, false);
});

test("producción rechaza DATABASE_SSL=false sin confirmación de red privada", () => {
  const result = inspectPool({ DATABASE_SSL: "false" });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /DATABASE_SSL=false en producción requiere DATABASE_TRUST_PRIVATE_NETWORK=true\./
  );
});
