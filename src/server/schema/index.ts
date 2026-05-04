import SchemaBuilder from '@pothos/core';

/**
 * Root schema builder. Resource-specific definitions live in sibling files
 * (project.ts, session.ts, ...) and are imported here for composition.
 */
const builder = new SchemaBuilder({});

builder.queryType({
	fields: (t) => ({
		ping: t.string({
			description: 'Health-check probe. Always returns "pong".',
			resolve: () => 'pong',
		}),
	}),
});

export const schema = builder.toSchema();
