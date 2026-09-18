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
	// Photo Mockups names for the five events above. Which spelling an endpoint
	// receives is its event_naming pin: endpoints created by earlier versions
	// keep the legacy 2d_* names, endpoints the trigger creates are pinned to these.
	{ name: 'photo_mockup.ready', value: 'photo_mockup.ready' },
	{ name: 'photo_mockup.rejected', value: 'photo_mockup.rejected' },
	{ name: 'photo_mockup.failed', value: 'photo_mockup.failed' },
	{ name: 'photo_mockup_render.succeeded', value: 'photo_mockup_render.succeeded' },
	{ name: 'photo_mockup_render.failed', value: 'photo_mockup_render.failed' },
	{ name: 'webhook.test', value: 'webhook.test' },
];

// The endpoint's event_naming pin. It decides which spelling of the five
// Photo Mockups events a delivery carries, and the payload `kind` follows it:
// 'current' delivers photo_mockup.* / photo_mockup_render.* with kind
// photo_mockup_create / photo_mockup_render, 'legacy' delivers 2d_mockup.* /
// 2d_render.* with kind 2d_create / 2d_render. Either spelling can be selected
// under Events; the pin decides what is delivered.
export const WEBHOOK_EVENT_NAMING_OPTIONS = [
	{
		name: 'Current',
		value: 'current',
		description:
			'Deliver the Photo Mockups names: photo_mockup.*, photo_mockup_render.*, kind photo_mockup_create or photo_mockup_render',
	},
	{
		name: 'Legacy',
		value: 'legacy',
		description:
			'Deliver the older names: 2d_mockup.*, 2d_render.*, kind 2d_create or 2d_render. Only for a receiver written against them',
	},
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
