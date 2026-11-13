// Retry only transactions that MySQL explicitly rolled back as deadlock victims.
// Never retry ambiguous connection/commit errors: a commit may have succeeded.
function isDeadlock(error) {
  return error?.code === "ER_LOCK_DEADLOCK" || error?.errno === 1213;
}

async function habitSaveTransaction(pool, userId, work, {
  attempts = 3,
  pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let connection;
    let started = false;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      started = true;
      // All habit saves for one account take this lock before reading entry gaps
      // or modifying entries/points. Separate accounts can still save in parallel.
      const [users] = await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
      if (!users.length) throw Object.assign(new Error("User not found."), { httpStatus: 404 });
      const result = await work(connection);
      await connection.commit();
      started = false;
      return result;
    } catch (error) {
      if (started) {
        try { await connection.rollback(); }
        catch { throw error; } // Do not retry if cleanup itself failed.
      }
      if (!isDeadlock(error) || attempt === attempts - 1) throw error;
    } finally {
      if (connection) connection.release();
    }
    // Release the connection before the short, bounded retry delay.
    await pause(20 * (attempt + 1));
  }
}

module.exports = { habitSaveTransaction, isDeadlock };
