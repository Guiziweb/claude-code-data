import { describe, expect, test } from 'bun:test';
import { createApp } from '../../src/server/server.ts';

const PREFLIGHT = (origin: string) =>
	new Request('http://localhost/graphql', {
		method: 'OPTIONS',
		headers: {
			origin,
			'access-control-request-method': 'POST',
			'access-control-request-headers': 'content-type',
		},
	});

describe('CORS', () => {
	test('disabled by default — no Access-Control-Allow-Origin on preflight', async () => {
		const app = createApp();
		const res = await app.fetch(PREFLIGHT('https://attacker.example'));
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
	});

	test('whitelisted origin gets Access-Control-Allow-Origin', async () => {
		const app = createApp({ corsOrigins: ['https://allowed.example'] });
		const res = await app.fetch(PREFLIGHT('https://allowed.example'));
		expect(res.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
	});

	test('non-whitelisted origin does not get Access-Control-Allow-Origin', async () => {
		const app = createApp({ corsOrigins: ['https://allowed.example'] });
		const res = await app.fetch(PREFLIGHT('https://other.example'));
		expect(res.headers.get('access-control-allow-origin')).not.toBe('https://other.example');
	});
});
