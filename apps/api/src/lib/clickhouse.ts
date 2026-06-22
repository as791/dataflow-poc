import { createClient } from '@clickhouse/client';

let _client: ReturnType<typeof createClient> | null = null;

export function chClient(): ReturnType<typeof createClient> {
  if (!_client) {
    _client = createClient({
      url: process.env.CLICKHOUSE_URL ?? 'http://clickhouse:8123',
      username: process.env.CLICKHOUSE_USER ?? 'dataflow',
      password: process.env.CLICKHOUSE_PASSWORD ?? 'dataflow',
      database: process.env.CLICKHOUSE_DB ?? 'dataflow',
    });
  }
  return _client;
}
