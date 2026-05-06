// Typed accessors for TranscriptMessage.message payload.
// message is looseObject({}) — sub-fields are unknown at the schema level.
// These helpers extract common fields safely without unsafe casts in consumers.

export function getMessageModel(message: Record<string, unknown>): string | undefined {
	const model = message.model;
	return typeof model === 'string' ? model : undefined;
}

export function getMessageId(message: Record<string, unknown>): string | undefined {
	const id = message.id;
	return typeof id === 'string' ? id : undefined;
}
