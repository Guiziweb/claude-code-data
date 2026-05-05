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

export function extractTextFromContent(content: unknown): string {
	if (typeof content === 'string') return content.trim();
	if (!Array.isArray(content)) return '';
	for (const block of content) {
		if (
			block &&
			typeof block === 'object' &&
			'type' in block &&
			block.type === 'text' &&
			'text' in block &&
			typeof block.text === 'string'
		) {
			const t = block.text.trim();
			if (t) return t;
		}
	}
	return '';
}
