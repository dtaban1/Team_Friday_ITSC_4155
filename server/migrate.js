const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

// Runs database.sql, which only creates what is missing (every statement is safe to repeat).
async function applySchemaFile() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "database.sql"), "utf8");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

// Adds a column only if it is not there yet, so existing databases get upgraded.
async function ensureColumn(pool, table, column, definition) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  if (rows.length) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`Database updated: added ${table}.${column}`);
}

async function runMigrations(pool) {
  await applySchemaFile();
  await ensureColumn(pool, "users", "first_name", "VARCHAR(50) NULL AFTER email");
  await ensureColumn(pool, "users", "last_name", "VARCHAR(50) NULL AFTER first_name");
  await ensureColumn(pool, "users", "bio", "VARCHAR(500) NULL AFTER last_name");
  await ensureColumn(pool, "users", "profile_picture", "MEDIUMBLOB NULL AFTER bio");
  await ensureColumn(pool, "users", "profile_picture_type", "VARCHAR(20) NULL AFTER profile_picture");
}

module.exports = { runMigrations, ensureColumn };
