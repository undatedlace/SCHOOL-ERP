import { createServer, type IncomingHttpHeaders } from 'node:http';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
}

const xmlError = (code: string, message: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;

/**
 * A tiny S3-compatible server (path-style addressing) for tests: it stores
 * objects in memory and records every request, so a test can check what the
 * real AWS SDK sent without needing an account or a network.
 */
export async function startFakeS3(bucket = 'test-bucket') {
  const objects = new Map<string, { body: Buffer; contentType?: string }>();
  const requests: RecordedRequest[] = [];
  let failNext: { status: number; code: string } | null = null;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = decodeURIComponent(
        new URL(req.url ?? '/', 'http://localhost').pathname,
      );
      requests.push({ method: req.method ?? '', path, headers: req.headers });

      const send = (
        status: number,
        body: string | Buffer = '',
        headers: Record<string, string | number> = {},
      ) => {
        res.writeHead(status, {
          'content-type': 'application/xml',
          ...headers,
        });
        res.end(body);
      };

      if (failNext) {
        const { status, code } = failNext;
        failNext = null;
        return send(status, xmlError(code, 'Simulated failure'));
      }

      const [, inBucket, ...rest] = path.split('/');
      const key = rest.join('/');
      if (inBucket !== bucket) {
        return send(
          404,
          xmlError('NoSuchBucket', 'The specified bucket does not exist'),
        );
      }

      if (req.method === 'PUT') {
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: req.headers['content-type'],
        });
        return send(200, '', { etag: '"fake-etag"' });
      }
      if (req.method === 'GET') {
        const found = objects.get(key);
        if (!found)
          return send(
            404,
            xmlError('NoSuchKey', 'The specified key does not exist.'),
          );
        return send(200, found.body, {
          'content-type': found.contentType ?? 'application/octet-stream',
          'content-length': found.body.length,
        });
      }
      if (req.method === 'DELETE') {
        objects.delete(key); // S3 answers 204 whether or not the key existed
        return send(204);
      }
      return send(405);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    objects,
    requests,
    /** The next request fails with this S3 error, for example 403 AccessDenied. */
    failNext(status: number, code: string) {
      failNext = { status, code };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
