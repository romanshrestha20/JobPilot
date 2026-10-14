// Only hosts that reliably mean "this machine" and that the postgres driver parses
// correctly. IPv6 literals ([::1]) are excluded because the driver cannot parse them.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Plain identifier ending in `_test`. No `/`, `%` or other characters: the driver passes the
// raw path through undecoded, so anything unusual would make "what we checked" differ from
// "what we connected to".
export const TEST_DATABASE_NAME = /^[A-Za-z0-9_]+_test$/;

// The URL parser keeps the case of non-special schemes' hostnames; DNS names are case-insensitive.
function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

function identity(url: URL): string {
  const host = hostOf(url) === "127.0.0.1" ? "localhost" : hostOf(url);
  return `${host}:${url.port || "5432"}/${url.pathname.slice(1)}`;
}

/**
 * Decides whether a connection string may be used by the integration tests, which
 * create and delete data. Throws unless the target is a local database whose name ends
 * in `_test`, has no query string, and is not any of `protectedUrls` (e.g. the app's
 * DATABASE_URL). Returns the validated URL. Error messages never include the connection
 * string, so credentials are not leaked.
 */
export function assertSafeTestDatabaseUrl(
  testUrl: string | undefined,
  protectedUrls: readonly (string | undefined)[] = [],
): string {
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a dedicated local *_test database (see .env.example).",
    );
  }

  let url: URL;
  try {
    url = new URL(testUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must be a postgres:// or postgresql:// URL.");
  }
  // Drivers differ on whether ?host=, ?port=, ?dbname= etc. override the URL, so allow none.
  if (url.search !== "" || url.hash !== "") {
    throw new Error("TEST_DATABASE_URL must not contain query parameters or a fragment.");
  }

  const databaseName = url.pathname.slice(1);
  if (!TEST_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}": name must be a plain identifier ending in _test.`,
    );
  }
  if (!LOCAL_HOSTS.has(hostOf(url))) {
    throw new Error(`Refusing to run integration tests against non-local host "${url.hostname}".`);
  }

  for (const protectedUrl of protectedUrls) {
    if (!protectedUrl) continue;
    let protectedIdentity: string;
    try {
      protectedIdentity = identity(new URL(protectedUrl));
    } catch {
      continue; // unparsable protected URL: nothing to compare
    }
    if (protectedIdentity === identity(url)) {
      throw new Error("TEST_DATABASE_URL points at the same database as DATABASE_URL.");
    }
  }

  return testUrl;
}
