import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_EVENT_OPTIONS = [
	{ name: 'render.succeeded', value: 'render.succeeded' },
	{ name: 'render.failed', value: 'render.failed' },
	{ name: 'upload.succeeded', value: 'upload.succeeded' },
	{ name: 'video.succeeded', value: 'video.succeeded' },
	{ name: 'video.failed', value: 'video.failed' },
	{ name: '2d_mockup.ready', value: '2d_mockup.ready' },
	{ name: '2d_mockup.rejected', value: '2d_mockup.rejected' },
	{ name: '2d_mockup.failed', value: '2d_mockup.failed' },
	{ name: '2d_render.succeeded', value: '2d_render.succeeded' },
	{ name: '2d_render.failed', value: '2d_render.failed' },
	{ name: 'webhook.test', value: 'webhook.test' },
];

export function verifyWebhookSignature(
	payload: string,
	signature: string,
	timestamp: string | number,
	secret: string,
	toleranceSeconds = 300,
	nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
	if (!signature || !secret) return false;

	const parsedTimestamp =
		typeof timestamp === 'number' ? timestamp : Number.parseInt(timestamp, 10);
	if (
		!Number.isFinite(parsedTimestamp) ||
		Math.abs(nowSeconds - parsedTimestamp) > toleranceSeconds
	) {
		return false;
	}

	const expected = createHmac('sha256', secret)
		.update(`${parsedTimestamp}.${payload}`)
		.digest('hex');
	if (signature.length !== expected.length) return false;

	try {
		return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
	} catch {
		return false;
	}
}
