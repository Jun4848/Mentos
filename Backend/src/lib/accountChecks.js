const { pool } = require('../config/db');
const { getCheckResetTimes } = require('./dormitory');

async function backfillCheckExpiry(database) {
  const [accounts] = await database.query(`SELECT id, updated_at AS "updatedAt" FROM user_accounts
    WHERE role = 'STUDENT' AND is_checked = TRUE AND checked_until IS NULL`);
  for (const account of accounts) {
    const { next } = getCheckResetTimes(new Date(account.updatedAt));
    await database.execute('UPDATE user_accounts SET checked_until = ? WHERE id = ? AND checked_until IS NULL', [next, account.id]);
  }
}

async function expireAccountChecks(database = pool, now = new Date()) {
  const { previous } = getCheckResetTimes(now);
  const [result] = await database.execute(`UPDATE user_accounts SET is_checked = FALSE, checked_until = NULL
    WHERE role = 'STUDENT' AND is_checked = TRUE
    AND (checked_until <= ? OR (checked_until IS NULL AND updated_at <= ?))`, [now, previous]);
  return result.affectedRows;
}

function startCheckExpiryTimer() {
  let timer;
  let stopped = false;
  function schedule(retry = false) {
    const now = new Date();
    const delay = retry ? 60000 : Math.max(1, getCheckResetTimes(now).next.getTime() - now.getTime() + 1);
    timer = setTimeout(async () => {
      let failed = false;
      try { await expireAccountChecks(); }
      catch (error) {
        failed = true;
        console.error('Check expiry failed:', error.code || error.message);
      }
      if (!stopped) schedule(failed);
    }, delay);
    timer.unref();
  }
  schedule();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { backfillCheckExpiry, expireAccountChecks, startCheckExpiryTimer };
