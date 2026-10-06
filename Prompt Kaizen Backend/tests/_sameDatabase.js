/**
 * Fails fast when a suite and the API are pointed at different databases.
 *
 * The suites talk to the API over HTTP and read MongoDB directly. If those two
 * targets disagree, nothing errors: writes succeed, reads come back empty, and
 * the failures look like application bugs (`role` undefined, logins refused).
 * That cost real debugging time three times, including a CI failure. A one-line
 * check at startup turns it into an explicit message.
 */
module.exports = async function assertSameDatabase(apiUrl, mongoose) {
  const res = await fetch(`${apiUrl}/ready`).catch(() => null);
  if (!res) {
    throw new Error(`Cannot reach the API at ${apiUrl}. Start it before running the suites.`);
  }
  const body = await res.json().catch(() => ({}));
  const serverDb = body.dbName;
  const testDb = mongoose.connection.name;

  // dbName is only reported outside production; skip rather than fail if the
  // API is running in production mode.
  if (!serverDb) return;

  if (serverDb !== testDb) {
    throw new Error(
      `Database mismatch — the API writes to "${serverDb}" but this suite reads "${testDb}".\n` +
      `  Set TEST_MONGO_URI to the same database the server was started with:\n` +
      `    TEST_MONGO_URI=mongodb://127.0.0.1:27055/${serverDb} npm test`
    );
  }
};
