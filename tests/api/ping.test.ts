import { describe, expect, test } from 'bun:test';
import { graphql } from 'graphql';
import { schema } from '../../src/server/schema/index.ts';

describe('ping', () => {
	test('returns "pong"', async () => {
		const result = await graphql({
			schema,
			source: '{ ping }',
		});
		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ ping: 'pong' });
	});
});
