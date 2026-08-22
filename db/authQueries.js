import pool from "./pool.js";

export async function findUserByUsername(username) {
  const result = await pool.query(
    `
      SELECT id, username, email, password_hash, platform_role
      FROM users
      WHERE LOWER(username) = LOWER($1)
    `,
    [username]
  );

  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await pool.query(
    `
      SELECT id, username, email, password_hash, platform_role, auth_provider, provider_subject, email_verified
      FROM users
      WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
    `,
    [email]
  );

  return result.rows[0];
}

export async function createUser({ username, email, passwordHash }) {
  const result = await pool.query(
    `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, platform_role, created_at
    `,
    [username, email, passwordHash]
  );

  return result.rows[0];
}

export async function findUserByProviderSubject(provider, subject) {
  const result = await pool.query(
    `SELECT id, username, email, password_hash, platform_role, auth_provider, provider_subject, email_verified
     FROM users WHERE auth_provider = $1 AND provider_subject = $2 LIMIT 1`,
    [provider, subject]
  );
  return result.rows[0];
}

export async function createGoogleUser({ username, email, providerSubject }) {
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, auth_provider, provider_subject, email_verified)
     VALUES ($1, $2, NULL, 'google', $3, true)
     RETURNING id, username, email, password_hash, platform_role, auth_provider, provider_subject, email_verified, created_at`,
    [username, email, providerSubject]
  );
  return result.rows[0];
}

export async function linkGoogleIdentity(userId, providerSubject) {
  const result = await pool.query(
    `UPDATE users SET auth_provider = 'google', provider_subject = $2, email_verified = true
     WHERE id = $1 RETURNING id, username, email, password_hash, platform_role, auth_provider, provider_subject, email_verified`,
    [userId, providerSubject]
  );
  return result.rows[0];
}

export async function findUserByIdentifier(identifier) {
  const result = await pool.query(
    `
      SELECT id, username, email, password_hash, platform_role
      FROM users
      WHERE
        LOWER(username) = LOWER($1)
        OR LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [identifier]
  );

  return result.rows[0];
}
