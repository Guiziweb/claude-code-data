import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { schema } from '../src/server/schema/index.ts';

/**
 * Writes the canonical SDL of the current Pothos schema to `schema.graphql`.
 *
 * Run on each PR via CI; `git diff --exit-code schema.graphql` must stay clean.
 * Lexicographic sort guarantees stable output regardless of field declaration order.
 */
const sdl = printSchema(lexicographicSortSchema(schema));
const target = resolve(import.meta.dir, '..', 'schema.graphql');

writeFileSync(target, `${sdl}\n`, 'utf-8');
console.log(`✓ wrote ${target}`);
