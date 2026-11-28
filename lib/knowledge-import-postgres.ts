import 'server-only';

type DatabaseRow = Record<string, unknown>;
type Connection = {
  query: (statement: string, parameters: unknown[]) => Promise<{ rows: DatabaseRow[] }>;
  destroy: () => Promise<void>;
};
type ClientOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: false | { rejectUnauthorized: true; ca?: string };
  connectionTimeoutMillis: number;
  statement_timeout: number;
  query_timeout: number;
  application_name: string;
};
type Client = {
  connect: () => Promise<void>;
  query: Connection['query'];
  end: () => Promise<void>;
  on: (event: 'error', listener: () => void) => void;
};
const { Client: PostgresClient } = require('pg') as { Client: new (options: ClientOptions) => Client };

type Options = {
  connectionUrl: string;
  login: string;
} & ({ mode: 'hosted'; ca?: string } | { mode: 'disposable' });

/** Open one session for the scoped SQL broker. The caller must destroy it after use. */
export function createKnowledgePostgresConnector(options: Options): () => Promise<Connection> {
  let url: URL;
  let user: string;
  let password: string;
  try {
    url = new URL(options.connectionUrl);
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new Error('Invalid knowledge database configuration');
  }

  const direct = /^db\.[a-z0-9]{20}\.supabase\.co$/.test(url.hostname);
  const sessionPooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  const hosted = options.mode === 'hosted';
  const permittedHost = hosted
    ? (direct || sessionPooler) && (url.port === '' || url.port === '5432')
    : url.hostname === '127.0.0.1' && url.port === '54322';
  const permittedLogin = /^[a-z][a-z0-9_]{0,62}$/.test(options.login) &&
    (hosted && sessionPooler ? user.startsWith(options.login + '.') &&
      /^[a-z0-9]{20}$/.test(user.slice(options.login.length + 1)) : user === options.login);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/postgres' ||
    url.search || url.hash || !permittedHost || !permittedLogin || !password
  ) {
    throw new Error('Invalid knowledge database configuration');
  }

  return async () => {
    const client = new PostgresClient({
      host: url.hostname,
      port: Number(url.port || 5432),
      user,
      password,
      database: 'postgres',
      ssl: hosted ? { rejectUnauthorized: true, ...(options.ca ? { ca: options.ca } : {}) } : false,
      connectionTimeoutMillis: 5000,
      statement_timeout: 18000,
      query_timeout: 20000,
      application_name: 'knowledge-import',
    });
    let broken = false;
    let closing: Promise<void> | undefined;
    client.on('error', () => { broken = true; });
    const destroy = () => (closing ??= client.end());
    try {
      await client.connect();
    } catch {
      await destroy().catch(() => {});
      throw new Error('Knowledge database connection failed');
    }
    return {
      async query(statement, parameters) {
        if (broken || closing) throw new Error('Knowledge database connection closed');
        return client.query(statement, parameters);
      },
      destroy,
    };
  };
}
