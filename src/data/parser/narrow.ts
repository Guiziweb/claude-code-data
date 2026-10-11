// Narrowing helpers for loosely-typed values read from CC files.

export function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined;
}
