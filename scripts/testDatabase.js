import { createTestDatabase, dropTestDatabase } from "../test/helpers/testDatabase.js";

const action = process.argv[2];

if (process.argv.length !== 3 || !["setup", "teardown"].includes(action)) {
  console.error("Uso: node scripts/testDatabase.js setup|teardown");
  process.exitCode = 1;
} else {
  try {
    if (action === "setup") {
      await createTestDatabase();
    } else {
      await dropTestDatabase();
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
