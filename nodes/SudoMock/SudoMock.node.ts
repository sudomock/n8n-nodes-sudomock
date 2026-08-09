import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeApiError,
	NodeOperationError,
	IDataObject,
	JsonObject,
	sleep,
} from 'n8n-workflow';

import { WEBHOOK_EVENT_OPTIONS } from './webhooks';

const TERMINAL_JOB_STATUSES = ['succeeded', 'failed', 'cancelled'];

interface TwoDPrintAreaPoints {
	point1X: number;
	point1Y: number;
	point2X: number;
	point2Y: number;
	point3X: number;
	point3Y: number;
	point4X: number;
	point4Y: number;
}

interface TwoDRenderTarget {
	targetType?: 'savedPrintArea' | 'fullSurface';
	uuid?: string;
	surfaceUuid?: string;
	artworkSource: string;
	artworkUrl?: string;
	base64?: string;
	removeBackground?: boolean;
	color?: string;
	adjustments?: IDataObject;
	placement?: IDataObject;
}

function format2DPrintAreas(printAreas: TwoDPrintAreaPoints[]) {
	return printAreas.map((area) => ({
		points: [
			[area.point1X, area.point1Y],
			[area.point2X, area.point2Y],
			[area.point3X, area.point3Y],
			[area.point4X, area.point4Y],
		],
	}));
}

function parseJsonArray(this: IExecuteFunctions, value: unknown, name: string): unknown[] {
	const parsed = typeof value === 'string' ? JSON.parse(value) : value;
	if (!Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), `${name} must be a JSON array`);
	}
	return parsed;
}

/**
 * Poll GET /api/v1/jobs/{job_id} until the job reaches a terminal status
 * (succeeded, failed, cancelled) or the timeout elapses. Uses a capped backoff.
 */
async function pollJob(
	this: IExecuteFunctions,
	jobId: string,
	timeoutSeconds: number,
): Promise<IDataObject> {
	const deadline = Date.now() + timeoutSeconds * 1000;
	let delayMs = 1500;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const job = (await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
			method: 'GET',
			url: `https://api.sudomock.com/api/v1/jobs/${jobId}`,
			json: true,
		})) as IDataObject;

		if (typeof job.status === 'string' && TERMINAL_JOB_STATUSES.includes(job.status)) {
			return job;
		}

		if (Date.now() + delayMs >= deadline) {
			throw new NodeOperationError(
				this.getNode(),
				`Timed out after ${timeoutSeconds}s waiting for job ${jobId} (last status: ${job.status ?? 'unknown'})`,
			);
		}

		await sleep(delayMs);
		delayMs = Math.min(delayMs * 1.5, 8000);
	}
}

export class SudoMock implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SudoMock',
		name: 'sudoMock',
		icon: { light: 'file:sudomock.svg', dark: 'file:sudomock.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Generate PSD and 2D mockups and product videos for Print-on-Demand automation. Upload PSDs, render with your designs, render videos, run renders asynchronously, track jobs, and manage webhooks.',
		defaults: {
			name: 'SudoMock',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'sudoMockApi',
				required: true,
			},
		],
		usableAsTool: true,
		properties: [
			// ============================================
			// OPERATION SELECT
			// ============================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: '2D: Create Mockup',
						value: 'create2DMockup',
						description: 'Create a 2D mockup now or queue it for background processing',
						action: 'Create a 2D mockup',
					},
					{
						name: '2D: Delete Mockup',
						value: 'delete2DMockup',
						description: 'Delete a 2D mockup',
						action: 'Delete a 2D mockup',
					},
					{
						name: '2D: Get Mockup',
						value: 'get2DMockup',
						description: 'Get the status and addressable render targets of a 2D mockup',
						action: 'Get a 2D mockup',
					},
					{
						name: '2D: List Mockups',
						value: 'list2DMockups',
						description: 'List your 2D mockups',
						action: 'List 2D mockups',
					},
					{
						name: '2D: Render Mockup',
						value: 'render2DMockup',
						description: 'Render artwork on a 2D mockup for 5 credits',
						action: 'Render a 2D mockup',
					},
					{
						name: '2D: Set Print Areas',
						value: 'set2DPrintAreas',
						description: 'Replace or clear the saved print area quads for a 2D mockup',
						action: 'Set 2D print areas',
					},
					{
						name: 'Artwork: Delete Stored Files',
						value: 'deleteArtworks',
						description: 'Delete stored order artwork by URL or mockup UUID',
						action: 'Delete stored artwork',
					},
					{
						name: 'Delete Mockup',
						value: 'deleteMockup',
						description: 'Delete a specific mockup template',
						action: 'Delete a mockup',
					},
					{
						name: 'Font: Delete Custom Font',
						value: 'deleteFont',
						description: 'Delete one of your uploaded fonts',
						action: 'Delete a custom font',
					},
					{
						name: 'Font: Get Font',
						value: 'getFont',
						description: 'Get one available font by UUID',
						action: 'Get a font',
					},
					{
						name: 'Font: List Fonts',
						value: 'listFonts',
						description: 'List system fonts and your uploaded fonts',
						action: 'List fonts',
					},
					{
						name: 'Font: Upload From URL',
						value: 'uploadFont',
						description: 'Upload a custom TTF or OTF font from a public URL',
						action: 'Upload a custom font',
					},
					{
						name: 'Get Account Info',
						value: 'getAccountInfo',
						description: 'Get account details, subscription, and usage statistics',
						action: 'Get account information',
					},
					{
						name: 'Get Job',
						value: 'getJob',
						description:
							'Poll an async job by its job_id (GET /jobs/{job_id}) to get its status and result',
						action: 'Get a job',
					},
					{
						name: 'Get Mockup',
						value: 'getMockup',
						description: 'Get details of a specific mockup template',
						action: 'Get mockup details',
					},
					{
						name: 'List Jobs',
						value: 'listJobs',
						description: 'List your async render, upload, and video jobs',
						action: 'List jobs',
					},
					{
						name: 'List Mockups',
						value: 'listMockups',
						description: 'List all your uploaded mockup templates',
						action: 'List mockups',
					},
					{
						name: 'Remove Background',
						value: 'removeBackground',
						description:
							'Remove the background from an image and get a transparent-PNG cutout through a signed URL valid for 7 days. The cutout remains stored. Costs 25 credits; auto-refunded on failure.',
						action: 'Remove an image background',
					},
					{
						name: 'Render Mockup',
						value: 'render',
						description: 'Render mockup with your design',
						action: 'Render a mockup',
					},
					{
						name: 'Render Video',
						value: 'renderVideo',
						description: 'Turn a mockup into a short product video (always async)',
						action: 'Render a video',
					},
					{
						name: 'Update Mockup',
						value: 'updateMockup',
						description: 'Update mockup template name',
						action: 'Update mockup name',
					},
					{
						name: 'Upload PSD',
						value: 'uploadPsd',
						description: 'Upload a PSD template from URL',
						action: 'Upload a PSD template',
					},
					{
						name: 'Webhook: Create Endpoint',
						value: 'webhookCreate',
						description: 'Create a webhook endpoint',
						action: 'Create a webhook endpoint',
					},
					{
						name: 'Webhook: Delete Endpoint',
						value: 'webhookDelete',
						description: 'Delete a webhook endpoint',
						action: 'Delete a webhook endpoint',
					},
					{
						name: 'Webhook: Events Feed',
						value: 'webhookEventsFeed',
						description: 'Recent deliveries across all of your webhook endpoints',
						action: 'Get the webhook events feed',
					},
					{
						name: 'Webhook: Get Endpoint',
						value: 'webhookGet',
						description: 'Get a single webhook endpoint',
						action: 'Get a webhook endpoint',
					},
					{
						name: 'Webhook: List Deliveries',
						value: 'webhookListDeliveries',
						description: 'List delivery attempts for a webhook endpoint',
						action: 'List webhook deliveries',
					},
					{
						name: 'Webhook: List Endpoints',
						value: 'webhookList',
						description: 'List your webhook endpoints',
						action: 'List webhook endpoints',
					},
					{
						name: 'Webhook: Replay Delivery',
						value: 'webhookReplayDelivery',
						description: 'Replay a single webhook delivery',
						action: 'Replay a webhook delivery',
					},
					{
						name: 'Webhook: Replay Failed Deliveries',
						value: 'webhookReplayFailed',
						description: 'Replay all failed or dead deliveries for an endpoint',
						action: 'Replay failed webhook deliveries',
					},
					{
						name: 'Webhook: Rotate Secret',
						value: 'webhookRotateSecret',
						description: 'Rotate the signing secret of a webhook endpoint',
						action: 'Rotate a webhook secret',
					},
					{
						name: 'Webhook: Send Test',
						value: 'webhookTest',
						description: 'Send a test event to a webhook endpoint',
						action: 'Send a webhook test',
					},
					{
						name: 'Webhook: Update Endpoint',
						value: 'webhookUpdate',
						description: 'Update a webhook endpoint',
						action: 'Update a webhook endpoint',
					},
				],
				default: 'render',
			},

			// ============================================
			// 2D MOCKUP PARAMETERS
			// ============================================
			{
				displayName: 'Source Type',
				name: 'twoDSourceMode',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['create2DMockup'],
					},
				},
				options: [
					{
						name: 'Image URL',
						value: 'url',
						description: 'Public image URL for the new 2D mockup',
					},
					{
						name: 'Base64 Image',
						value: 'base64',
						description: 'Base64 image data for the new 2D mockup',
					},
				],
				default: 'url',
				description: 'Image source for the new 2D mockup',
			},
			{
				displayName: 'Source URL',
				name: 'twoDSourceUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['create2DMockup'],
						twoDSourceMode: ['url'],
					},
				},
				default: '',
				placeholder: 'https://cdn.example.com/product.png',
				description: 'Public image URL for the new 2D mockup',
			},
			{
				displayName: 'Source Base64',
				name: 'twoDSourceBase64',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['create2DMockup'],
						twoDSourceMode: ['base64'],
					},
				},
				default: '',
				description: 'Base64 image data for the new 2D mockup',
			},
			{
				displayName: 'Name',
				name: 'twoDName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['create2DMockup'],
					},
				},
				default: '',
				placeholder: 'T-Shirt Front',
				description: 'Optional human-readable name for the new 2D mockup',
			},
			{
				displayName: 'Run Asynchronously',
				name: 'twoDCreateIsAsync',
				type: 'boolean',
				displayOptions: { show: { operation: ['create2DMockup'] } },
				default: false,
				description: 'Whether to queue creation and return a job_id (kind: 2d_create) immediately',
			},
			{
				displayName: 'Limit',
				name: 'twoDListLimit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				displayOptions: { show: { operation: ['list2DMockups'] } },
				default: 50,
				description: 'Number of 2D mockups to return from 1 to 100',
			},
			{
				displayName: 'Offset',
				name: 'twoDListOffset',
				type: 'number',
				typeOptions: { minValue: 0 },
				displayOptions: { show: { operation: ['list2DMockups'] } },
				default: 0,
				description: 'Number of 2D mockups to skip',
			},
			{
				displayName: 'Customizable Only',
				name: 'twoDListCustomizableOnly',
				type: 'boolean',
				displayOptions: { show: { operation: ['list2DMockups'] } },
				default: false,
				description: 'Whether to return only mockups ready for shopper customization',
			},
			{
				displayName: 'Mockup UUID',
				name: 'twoDMockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['get2DMockup', 'set2DPrintAreas', 'render2DMockup', 'delete2DMockup'],
					},
				},
				default: '',
				placeholder: 'c315f78f-d2c7-4541-b240-a9372842de94',
				description: 'UUID of the 2D mockup to get, set print areas for, render, or delete',
			},
			{
				displayName: 'Print Areas',
				name: 'twoDSetPrintAreas',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['create2DMockup', 'set2DPrintAreas'],
					},
				},
				default: {},
				placeholder: 'Add Print Area',
				description:
					'Optional during creation. Set Print Areas may send an empty list; the API decides whether the mockup can remain renderable without saved areas.',
				options: [
					{
						name: 'items',
						displayName: 'Print Area',
						values: [
							{
								displayName: 'Point 1 X',
								name: 'point1X',
								type: 'number',
								required: true,
								default: 0,
								description: 'X coordinate of point 1',
							},
							{
								displayName: 'Point 1 Y',
								name: 'point1Y',
								type: 'number',
								required: true,
								default: 0,
								description: 'Y coordinate of point 1',
							},
							{
								displayName: 'Point 2 X',
								name: 'point2X',
								type: 'number',
								required: true,
								default: 0,
								description: 'X coordinate of point 2',
							},
							{
								displayName: 'Point 2 Y',
								name: 'point2Y',
								type: 'number',
								required: true,
								default: 0,
								description: 'Y coordinate of point 2',
							},
							{
								displayName: 'Point 3 X',
								name: 'point3X',
								type: 'number',
								required: true,
								default: 0,
								description: 'X coordinate of point 3',
							},
							{
								displayName: 'Point 3 Y',
								name: 'point3Y',
								type: 'number',
								required: true,
								default: 0,
								description: 'Y coordinate of point 3',
							},
							{
								displayName: 'Point 4 X',
								name: 'point4X',
								type: 'number',
								required: true,
								default: 0,
								description: 'X coordinate of point 4',
							},
							{
								displayName: 'Point 4 Y',
								name: 'point4Y',
								type: 'number',
								required: true,
								default: 0,
								description: 'Y coordinate of point 4',
							},
						],
					},
				],
			},
			{
				displayName: 'Render Targets',
				name: 'twoDRenderPrintAreas',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				required: true,
				displayOptions: {
					show: {
						operation: ['render2DMockup'],
					},
				},
				default: {},
				placeholder: 'Add Render Target',
				description:
					'Artwork and options for each target. Select exactly one saved print area UUID or full-surface UUID.',
				options: [
					{
						name: 'items',
						displayName: 'Render Target',
						values: [
							{
								displayName: 'Adjustments',
								name: 'adjustments',
								type: 'collection',
								placeholder: 'Add Adjustment',
								default: {},
								description: 'Artwork appearance settings for this print area',
								options: [
									{
										displayName: 'Blend Mode',
										name: 'blend_mode',
										type: 'options',
										options: [
											{ name: 'Multiply', value: 'multiply' },
											{ name: 'Normal', value: 'normal' },
										],
										default: 'multiply',
										description: 'Artwork blend mode for the product surface',
									},
									{
										displayName: 'Blur',
										name: 'blur',
										type: 'number',
										typeOptions: { minValue: 0, maxValue: 100 },
										default: 0,
										description: 'Gaussian blur amount from 0 to 100',
									},
									{
										displayName: 'Brightness',
										name: 'brightness',
										type: 'number',
										typeOptions: { minValue: -150, maxValue: 150 },
										default: 0,
										description: 'Brightness adjustment from -150 to 150',
									},
									{
										displayName: 'Contrast',
										name: 'contrast',
										type: 'number',
										typeOptions: { minValue: -100, maxValue: 100 },
										default: 0,
										description: 'Contrast adjustment from -100 to 100',
									},
									{
										displayName: 'Opacity',
										name: 'opacity',
										type: 'number',
										typeOptions: { minValue: 0, maxValue: 100 },
										default: 100,
										description: 'Artwork opacity from 0 to 100',
									},
									{
										displayName: 'Saturation',
										name: 'saturation',
										type: 'number',
										typeOptions: { minValue: -100, maxValue: 100 },
										default: 0,
										description: 'Saturation adjustment from -100 to 100',
									},
									{
										displayName: 'Vibrance',
										name: 'vibrance',
										type: 'number',
										typeOptions: { minValue: -100, maxValue: 100 },
										default: 0,
										description: 'Vibrance adjustment from -100 to 100',
									},
								],
							},
							{
								displayName: 'Artwork Type',
								name: 'artworkSource',
								type: 'options',
								options: [
									{
										name: 'Artwork URL',
										value: 'url',
										description: 'Public artwork URL for this print area',
									},
									{
										name: 'Base64 Artwork',
										value: 'base64',
										description: 'Base64 artwork data for this print area',
									},
								],
								default: 'url',
								description: 'Artwork source for this print area',
							},
							{
								displayName: 'Artwork URL',
								name: 'artworkUrl',
								type: 'string',
								required: true,
								displayOptions: {
									show: {
										artworkSource: ['url'],
									},
								},
								default: '',
								placeholder: 'https://cdn.example.com/design.png',
								description: 'Public artwork URL for this print area',
							},
							{
								displayName: 'Base64 Artwork',
								name: 'base64',
								type: 'string',
								required: true,
								displayOptions: {
									show: {
										artworkSource: ['base64'],
									},
								},
								default: '',
								description: 'Base64 artwork data for this print area',
							},
							{
								displayName: 'Color',
								name: 'color',
								type: 'color',
								default: '',
								placeholder: '#FF0000',
								description: 'Optional hex color fill or overlay',
							},
							{
								displayName: 'Full-Surface UUID',
								name: 'surfaceUuid',
								type: 'string',
								required: true,
								displayOptions: {
									show: {
										targetType: ['fullSurface'],
									},
								},
								default: '',
								description: 'The surface_uuid returned in data.surfaces by 2D: Get Mockup',
							},
							{
								displayName: 'Placement',
								name: 'placement',
								type: 'collection',
								placeholder: 'Add Placement Option',
								default: {},
								description: 'Artwork position and size settings for this print area',
								options: [
									{
										displayName: 'Coverage',
										name: 'coverage',
										type: 'number',
										typeOptions: { minValue: 10, maxValue: 100 },
										default: 70,
										description: 'Percentage of the print area covered by the artwork',
									},
									{
										displayName: 'Fit',
										name: 'fit',
										type: 'options',
										options: [
											{ name: 'Fill', value: 'fill' },
											{ name: 'Contain', value: 'contain' },
											{ name: 'Cover', value: 'cover' },
										],
										default: 'contain',
										description: 'How the artwork fits within the print area',
									},
									{
										displayName: 'Height',
										name: 'height',
										type: 'number',
										typeOptions: { minValue: 1, maxValue: 30000 },
										default: 1000,
										description:
											'Artwork height in print-area pixels. Add Width alongside it. Adding only one of the two is rejected rather than silently completed, so the aspect ratio is never guessed for you.',
									},
									{
										displayName: 'Offset X',
										name: 'offset_x',
										type: 'number',
										default: 0,
										description: 'Horizontal artwork offset in pixels',
									},
									{
										displayName: 'Offset Y',
										name: 'offset_y',
										type: 'number',
										default: 0,
										description: 'Vertical artwork offset in pixels',
									},
									{
										displayName: 'Position',
										name: 'position',
										type: 'options',
										options: [
											{ name: 'Bottom Center', value: 'bottom_center' },
											{ name: 'Bottom Left', value: 'bottom_left' },
											{ name: 'Bottom Right', value: 'bottom_right' },
											{ name: 'Center', value: 'center' },
											{ name: 'Center Left', value: 'center_left' },
											{ name: 'Center Right', value: 'center_right' },
											{ name: 'Top Center', value: 'top_center' },
											{ name: 'Top Left', value: 'top_left' },
											{ name: 'Top Right', value: 'top_right' },
										],
										default: 'center',
										description: 'Predefined artwork position in the print area',
									},
									{
										displayName: 'Rotation',
										name: 'rotation',
										type: 'number',
										default: 0,
										description: 'Artwork rotation in degrees',
									},
									{
										displayName: 'Width',
										name: 'width',
										type: 'number',
										typeOptions: { minValue: 1, maxValue: 30000 },
										default: 1000,
										description:
											'Artwork width in print-area pixels. Add Height alongside it; the pair overrides Coverage and Fit. Width and Height are independent, so any aspect ratio is allowed.',
									},
								],
							},
							{
								displayName: 'Remove Background',
								name: 'removeBackground',
								type: 'boolean',
								default: false,
								description:
									'Whether to remove the artwork background before placing it. Adds 25 credits per artwork.',
							},
							{
								displayName: 'Saved Print Area UUID',
								name: 'uuid',
								type: 'string',
								required: true,
								displayOptions: {
									show: {
										targetType: ['savedPrintArea'],
									},
								},
								default: '',
								description: 'The print_area_id returned in data.quads by 2D: Get Mockup',
							},
							{
								displayName: 'Target Type',
								name: 'targetType',
								type: 'options',
								options: [
									{
										name: 'Saved Print Area',
										value: 'savedPrintArea',
										description: 'Target a saved print area returned in data.quads',
									},
									{
										name: 'Full Surface',
										value: 'fullSurface',
										description: 'Target a full surface returned in data.surfaces',
									},
								],
								default: 'savedPrintArea',
								description: 'Whether this artwork targets a saved area or a full surface',
							},
						],
					},
				],
			},
			{
				displayName: 'Export Options',
				name: 'twoDExportOptions',
				type: 'collection',
				placeholder: 'Add Export Option',
				displayOptions: {
					show: {
						operation: ['render2DMockup'],
					},
				},
				default: {},
				description: 'Output image settings for the rendered 2D mockup',
				options: [
					{
						displayName: 'Image Format',
						name: 'image_format',
						type: 'options',
						options: [
							{ name: 'PNG', value: 'png' },
							{ name: 'JPG', value: 'jpg' },
						],
						default: 'png',
						description: 'File format of the rendered image',
					},
					{
						displayName: 'Image Size',
						name: 'image_size',
						type: 'options',
						options: [
							{ name: '1024', value: 1024 },
							{ name: '2048', value: 2048 },
							{ name: '4096', value: 4096 },
						],
						default: 2048,
						description: 'Width of the rendered image in pixels',
					},
					{
						displayName: 'Quality',
						name: 'quality',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 100 },
						default: 90,
						description: 'JPG compression quality from 1 to 100',
					},
					{
						displayName: 'DPI',
						name: 'dpi',
						type: 'number',
						typeOptions: { minValue: 72, maxValue: 2400 },
						default: 300,
						description: 'Print resolution tag from 72 to 2400 DPI',
					},
				],
			},
			{
				displayName: 'Run Asynchronously',
				name: 'twoDRenderIsAsync',
				type: 'boolean',
				displayOptions: { show: { operation: ['render2DMockup'] } },
				default: false,
				description:
					'Whether to queue the render and return a job_id (kind: 2d_render) immediately',
			},

			// ============================================
			// UPLOAD PSD PARAMETERS
			// ============================================
			{
				displayName: 'PSD File URL',
				name: 'psdFileUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['uploadPsd'],
					},
				},
				default: '',
				placeholder: 'https://your-storage.com/mockup-template.psd',
				description:
					"Public URL to your PSD file (up to Adobe's official PSD file size limit). Use S3, GCS, or any public URL.",
			},
			{
				displayName: 'Template Name',
				name: 'psdName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['uploadPsd'],
					},
				},
				default: '',
				placeholder: 'T-Shirt Mockup Front',
				description: 'Human-readable name for the template. Auto-generated from filename if empty.',
			},
			{
				displayName: 'Run Asynchronously',
				name: 'uploadIsAsync',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['uploadPsd'],
					},
				},
				default: false,
				description:
					'Whether to queue the upload in the background. Returns a job_id (kind: upload) immediately instead of the inline result. Track it with the Get Job operation; result_url carries the new mockup_uuid on success.',
			},

			// ============================================
			// RENDER PARAMETERS
			// ============================================
			{
				displayName: 'Mockup UUID',
				name: 'mockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['render'],
					},
				},
				default: '',
				placeholder: 'c315f78f-d2c7-4541-b240-a9372842de94',
				description: 'UUID of the uploaded mockup template (from Upload PSD response)',
			},
			{
				displayName: 'Smart Objects',
				name: 'smartObjects',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['render'],
					},
				},
				default: {},
				placeholder: 'Add Smart Object',
				description: 'Configure which smart objects to fill with your designs',
				options: [
					{
						name: 'items',
						displayName: 'Smart Object',
						values: [
							{
								displayName: 'Smart Object UUID',
								name: 'uuid',
								type: 'string',
								default: '',
								required: true,
								description: 'UUID of the smart object (from Upload PSD response)',
							},
							{
								displayName: 'Design URL',
								name: 'assetUrl',
								type: 'string',
								default: '',
								required: true,
								placeholder: 'https://cdn.example.com/design.png',
								description: 'URL to your design image (PNG, JPG, WebP)',
							},
							{
								displayName: 'Fit Mode',
								name: 'fit',
								type: 'options',
								options: [
									{
										name: 'Fill',
										value: 'fill',
										description: 'Stretch to fill entire area (default)',
									},
									{
										name: 'Contain',
										value: 'contain',
										description: 'Fit inside, may leave space',
									},
									{
										name: 'Cover',
										value: 'cover',
										description: 'Fill area, may crop edges',
									},
								],
								default: 'fill',
								description: 'How to fit the design in the smart object bounds',
							},
							{
								displayName: 'Additional Options',
								name: 'additionalOptions',
								type: 'collection',
								placeholder: 'Add Option',
								default: {},
								options: [
									{
										displayName: 'Base64 Image',
										name: 'base64',
										type: 'string',
										default: '',
										description:
											'Raw base64-encoded image bytes (no data: prefix). Alternative to Design URL; eliminates server-side download latency. If set, takes priority over the URL.',
									},
									{
										displayName: 'Blur',
										name: 'blur',
										type: 'number',
										typeOptions: {
											minValue: 0,
											maxValue: 100,
										},
										default: 0,
										description: 'Gaussian blur amount (0=sharp, 100=max blur)',
									},
									{
										displayName: 'Brightness',
										name: 'brightness',
										type: 'number',
										typeOptions: {
											minValue: -150,
											maxValue: 150,
										},
										default: 0,
										description: 'Brightness adjustment (-150 to 150)',
									},
									{
										displayName: 'Color Blend Mode',
										name: 'colorBlendMode',
										type: 'options',
										options: [
											{ name: 'Color Burn', value: 'color-burn' },
											{ name: 'Color Dodge', value: 'color-dodge' },
											{ name: 'Darken', value: 'darken' },
											{ name: 'Hard Light', value: 'hard-light' },
											{ name: 'Lighten', value: 'lighten' },
											{ name: 'Multiply', value: 'multiply' },
											{ name: 'Normal', value: 'normal' },
											{ name: 'Overlay', value: 'overlay' },
											{ name: 'Screen', value: 'screen' },
											{ name: 'Soft Light', value: 'soft-light' },
										],
										default: 'normal',
										description: 'Blend mode for color overlay',
									},
									{
										displayName: 'Color Overlay (Hex)',
										name: 'colorHex',
										type: 'color',
										default: '',
										placeholder: '#FF5733',
										description: 'Apply color overlay to the design',
									},
									{
										displayName: 'Content Type',
										name: 'contentType',
										type: 'options',
										options: [
											{ name: 'PNG', value: 'image/png' },
											{ name: 'JPEG', value: 'image/jpeg' },
											{ name: 'WebP', value: 'image/webp' },
											{ name: 'GIF', value: 'image/gif' },
										],
										default: 'image/png',
										description: 'MIME type of the Base64 Image. Defaults to image/png if omitted.',
									},
									{
										displayName: 'Contrast',
										name: 'contrast',
										type: 'number',
										typeOptions: {
											minValue: -100,
											maxValue: 100,
										},
										default: 0,
										description: 'Contrast adjustment (-100 to 100)',
									},
									{
										displayName: 'Custom Height',
										name: 'sizeHeight',
										type: 'number',
										typeOptions: {
											minValue: 1,
										},
										default: 0,
										description:
											'Custom asset height override in pixels. 0 = use smart object bounds.',
									},
									{
										displayName: 'Custom Width',
										name: 'sizeWidth',
										type: 'number',
										typeOptions: {
											minValue: 1,
										},
										default: 0,
										description:
											'Custom asset width override in pixels. 0 = use smart object bounds.',
									},
									{
										displayName: 'Opacity',
										name: 'opacity',
										type: 'number',
										typeOptions: {
											minValue: 0,
											maxValue: 100,
										},
										default: 100,
										description: 'Layer opacity (0-100)',
									},
									{
										displayName: 'Position Left',
										name: 'positionLeft',
										type: 'number',
										default: 0,
										description: 'Custom position left offset in pixels',
									},
									{
										displayName: 'Position Top',
										name: 'positionTop',
										type: 'number',
										default: 0,
										description: 'Custom position top offset in pixels',
									},
									{
										displayName: 'Remove Background',
										name: 'removeBackground',
										type: 'boolean',
										default: false,
										description:
											'Whether to remove the artwork background before placing it. Adds 25 credits per artwork.',
									},
									{
										displayName: 'Rotation',
										name: 'rotate',
										type: 'number',
										typeOptions: {
											minValue: -360,
											maxValue: 360,
										},
										default: 0,
										description: 'Rotation angle in degrees',
									},
									{
										displayName: 'Saturation',
										name: 'saturation',
										type: 'number',
										typeOptions: {
											minValue: -100,
											maxValue: 100,
										},
										default: 0,
										description:
											'Saturation adjustment (-100 to 100). 0=no change, -100=grayscale.',
									},
									{
										displayName: 'Vibrance',
										name: 'vibrance',
										type: 'number',
										typeOptions: {
											minValue: -100,
											maxValue: 100,
										},
										default: 0,
										description:
											'Vibrance adjustment (-100 to 100). Similar to saturation but preserves skin tones.',
									},
								],
							},
						],
					},
				],
			},
			{
				displayName: 'Text Layers',
				name: 'textLayers',
				type: 'json',
				displayOptions: { show: { operation: ['render'] } },
				default: '[]',
				description:
					'Optional text layer override array. Each item needs uuid plus text or segments, and can include font, font_size, color, stroke_color, and fit (overflow, shrink, or clip).',
			},
			{
				displayName: 'Export Options',
				name: 'exportOptions',
				type: 'collection',
				placeholder: 'Add Export Option',
				displayOptions: {
					show: {
						operation: ['render'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'DPI',
						name: 'dpi',
						type: 'number',
						typeOptions: {
							minValue: 72,
							maxValue: 2400,
						},
						default: 300,
						description:
							'Print resolution 72-2400. Embeds a resolution tag in output metadata (JPEG/PNG/WebP). Does not change pixel count, image_size controls that (for a true print file: image_size = print inches x dpi). jpg/png recommended for max compatibility. Leave unset for web mockups.',
					},
					{
						displayName: 'Export Label',
						name: 'exportLabel',
						type: 'string',
						default: '',
						description: 'Optional label for the output file naming',
					},
					{
						displayName: 'Image Format',
						name: 'imageFormat',
						type: 'options',
						options: [
							{
								name: 'WebP (Recommended)',
								value: 'webp',
								description: '~30% smaller than PNG with similar quality',
							},
							{
								name: 'PNG',
								value: 'png',
								description: 'Lossless, supports transparency',
							},
							{
								name: 'JPEG',
								value: 'jpg',
								description: 'Smaller file size, no transparency',
							},
						],
						default: 'webp',
					},
					{
						displayName: 'Image Size (Width)',
						name: 'imageSize',
						type: 'number',
						typeOptions: {
							minValue: 100,
							maxValue: 10000,
						},
						default: 2048,
						description:
							'Output width in pixels (100-10000). Height scales proportionally. Powers of 2 (1024, 2048, 4096) recommended.',
					},
					{
						displayName: 'Quality',
						name: 'quality',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 100,
						},
						default: 90,
						description: 'Quality for JPG/WebP output (1-100). Ignored for PNG (always lossless).',
					},
				],
			},
			{
				displayName: 'Run Asynchronously',
				name: 'isAsync',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['render'],
					},
				},
				default: false,
				description:
					'Whether to process the render in the background. Returns a job_id (kind: render) immediately instead of the inline result. Track it with the Get Job operation.',
			},

			// ============================================
			// RENDER VIDEO PARAMETERS
			// ============================================
			{
				displayName: 'Input Mode',
				name: 'videoInputMode',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['renderVideo'],
					},
				},
				options: [
					{
						name: 'Render Mockup',
						value: 'render',
						description: 'Render a mockup with your designs, then animate it',
					},
					{
						name: 'Animate Image URL',
						value: 'image',
						description: 'Animate an existing public image URL directly',
					},
				],
				default: 'render',
				description: 'Whether to render a mockup first or animate an existing image URL',
			},
			{
				displayName: 'Mockup UUID',
				name: 'videoMockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['renderVideo'],
						videoInputMode: ['render'],
					},
				},
				default: '',
				placeholder: 'c315f78f-d2c7-4541-b240-a9372842de94',
				description: 'UUID of the uploaded mockup template to animate',
			},
			{
				displayName: 'Image URL',
				name: 'videoImageUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['renderVideo'],
						videoInputMode: ['image'],
					},
				},
				default: '',
				placeholder: 'https://cdn.example.com/product.png',
				description:
					'Public HTTPS image URL to animate directly (.png, .jpg, .jpeg, .webp, .gif, .avif)',
			},
			{
				displayName: 'Smart Objects',
				name: 'videoSmartObjects',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['renderVideo'],
						videoInputMode: ['render'],
					},
				},
				default: {},
				placeholder: 'Add Smart Object',
				description: 'Smart objects to fill with your designs, same format as Render Mockup',
				options: [
					{
						name: 'items',
						displayName: 'Smart Object',
						values: [
							{
								displayName: 'Smart Object UUID',
								name: 'uuid',
								type: 'string',
								default: '',
								required: true,
								description: 'UUID of the smart object (from Upload PSD response)',
							},
							{
								displayName: 'Design URL',
								name: 'assetUrl',
								type: 'string',
								default: '',
								required: true,
								placeholder: 'https://cdn.example.com/design.png',
								description: 'URL to your design image (PNG, JPG, WebP)',
							},
							{
								displayName: 'Fit Mode',
								name: 'fit',
								type: 'options',
								options: [
									{
										name: 'Fill',
										value: 'fill',
										description: 'Stretch to fill entire area',
									},
									{
										name: 'Contain',
										value: 'contain',
										description: 'Fit inside, may leave space',
									},
									{
										name: 'Cover',
										value: 'cover',
										description: 'Fill area, may crop edges (recommended)',
									},
								],
								default: 'cover',
								description: 'How to fit the design in the smart object bounds',
							},
						],
					},
				],
			},
			{
				displayName: 'Webhook URL',
				name: 'videoWebhookUrl',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['renderVideo'],
					},
				},
				default: '',
				placeholder: 'https://your-app.com/webhooks/sudomock',
				description:
					'Optional one-off HTTPS URL to notify when this video job finishes. Independent of any saved webhook endpoints.',
			},
			{
				displayName: 'Video Options',
				name: 'videoOptions',
				type: 'collection',
				placeholder: 'Add Video Option',
				displayOptions: {
					show: {
						operation: ['renderVideo'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Duration (Seconds)',
						name: 'durationSeconds',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 15,
						},
						default: 4,
						description:
							"Length of the clip in seconds. Must be one of the chosen model's allowed durations (the default model veo-3.1-fast allows 4 or 6). Longer clips cost more credits.",
					},
					{
						displayName: 'Audio',
						name: 'audio',
						type: 'boolean',
						default: false,
						description:
							'Whether to include a generated audio track. Enabling audio can cost extra credits depending on the model.',
					},
					{
						displayName: 'Motion',
						name: 'motion',
						type: 'options',
						options: [
							{
								name: 'Ambient',
								value: 'ambient',
								description: 'Subtle ambient motion (default)',
							},
							{
								name: 'Showcase',
								value: 'showcase',
								description: 'More pronounced product-showcase motion',
							},
						],
						default: 'ambient',
						description: 'Animation style for the generated clip',
					},
					{
						displayName: 'Advanced Model',
						name: 'advancedModel',
						type: 'string',
						default: '',
						placeholder: 'kling-v3-pro',
						description:
							'Optional override to pin a specific model from the roster (veo-3.1-fast, kling-v3-pro, kling-2.6-pro, seedance-2.0, wan-2.5). Leave empty to let SudoMock auto-pick by plan tier. An unknown ID returns a 400 error.',
					},
				],
			},
			{
				displayName: 'Wait for Completion',
				name: 'videoWaitForCompletion',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['renderVideo'],
					},
				},
				default: false,
				description:
					'Whether to poll the job until it finishes and return the result, instead of returning the queued job immediately',
			},
			{
				displayName: 'Poll Timeout (Seconds)',
				name: 'videoPollTimeout',
				type: 'number',
				typeOptions: {
					minValue: 5,
				},
				displayOptions: {
					show: {
						operation: ['renderVideo'],
						videoWaitForCompletion: [true],
					},
				},
				default: 300,
				description: 'Maximum time to wait for the video job to finish',
			},

			// ============================================
			// GET JOB PARAMETERS
			// ============================================
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['getJob'],
					},
				},
				default: '',
				placeholder: '9d4e2b51-0c7a-4f8e-bb1c-2a6f9e3d8c10',
				description: 'The job_id returned by an async render, upload, video, or 2D mockup request',
			},
			{
				displayName: 'Wait for Completion',
				name: 'jobWaitForCompletion',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['getJob'],
					},
				},
				default: false,
				description:
					'Whether to poll the job until it reaches a terminal status (succeeded, failed, or cancelled) instead of returning the current state once',
			},
			{
				displayName: 'Poll Timeout (Seconds)',
				name: 'jobPollTimeout',
				type: 'number',
				typeOptions: {
					minValue: 5,
				},
				displayOptions: {
					show: {
						operation: ['getJob'],
						jobWaitForCompletion: [true],
					},
				},
				default: 300,
				description: 'Maximum time to wait for the job to finish',
			},

			// ============================================
			// LIST JOBS PARAMETERS
			// ============================================
			{
				displayName: 'Filters',
				name: 'listJobsFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				displayOptions: {
					show: {
						operation: ['listJobs'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Kind',
						name: 'kind',
						type: 'options',
						options: [
							{ name: '2D Create', value: '2d_create' },
							{ name: '2D Render', value: '2d_render' },
							{ name: 'Render', value: 'render' },
							{ name: 'Upload', value: 'upload' },
							{ name: 'Video', value: 'video' },
						],
						default: 'render',
						description: 'Only return jobs of this kind',
					},
					{
						displayName: 'Mockup UUID',
						name: 'mockupUuid',
						type: 'string',
						default: '',
						description: 'Only return jobs derived from this source mockup',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 50,
						},
						default: 50,
						description: 'Max number of results to return',
					},
					{
						displayName: 'Cursor',
						name: 'cursor',
						type: 'string',
						default: '',
						description:
							'Opaque keyset cursor from a previous response (next_cursor) for pagination',
					},
				],
			},

			// ============================================
			// FONT PARAMETERS
			// ============================================
			{
				displayName: 'Font UUID',
				name: 'fontUuid',
				type: 'string',
				required: true,
				displayOptions: { show: { operation: ['getFont', 'deleteFont'] } },
				default: '',
				description: 'Font UUID from Font: List Fonts',
			},
			{
				displayName: 'Font URL',
				name: 'fontUrl',
				type: 'string',
				required: true,
				displayOptions: { show: { operation: ['uploadFont'] } },
				default: '',
				placeholder: 'https://example.com/fonts/Brand-Bold.ttf',
				description: 'Public URL of a TTF or OTF font file',
			},
			{
				displayName: 'License Confirmed',
				name: 'fontLicenseConfirmed',
				type: 'boolean',
				displayOptions: { show: { operation: ['uploadFont'] } },
				default: false,
				description: 'Whether you confirm you have the right to use and embed this font',
			},
			{
				displayName: 'Filters',
				name: 'fontFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				displayOptions: { show: { operation: ['listFonts'] } },
				default: {},
				options: [
					{
						displayName: 'Category',
						name: 'category',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
					},
					{
						displayName: 'Results Per Page',
						name: 'perPage',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 100 },
						default: 50,
					},
					{
						displayName: 'Scope',
						name: 'scope',
						type: 'options',
						options: [
							{ name: 'All', value: 'all' },
							{ name: 'System', value: 'system' },
							{ name: 'Custom', value: 'custom' },
						],
						default: 'all',
					},
					{
						displayName: 'Search',
						name: 'search',
						type: 'string',
						default: '',
						description: 'Filter by font family name',
					},
				],
			},

			// ============================================
			// BACKGROUND REMOVAL PARAMETERS
			// ============================================
			{
				displayName: 'Image URL',
				name: 'removeBackgroundImageUrl',
				type: 'string',
				required: true,
				displayOptions: { show: { operation: ['removeBackground'] } },
				default: '',
				placeholder: 'https://cdn.example.com/product-photo.jpg',
				description: 'Public URL of the image to isolate onto a transparent background',
			},

			// ============================================
			// ARTWORK PARAMETERS
			// ============================================
			{
				displayName: 'Delete By',
				name: 'artworkDeleteMode',
				type: 'options',
				displayOptions: { show: { operation: ['deleteArtworks'] } },
				options: [
					{ name: 'URLs', value: 'urls' },
					{ name: 'Mockup UUID', value: 'mockup' },
				],
				default: 'urls',
			},
			{
				displayName: 'URLs',
				name: 'artworkDeleteUrls',
				type: 'json',
				required: true,
				displayOptions: {
					show: { operation: ['deleteArtworks'], artworkDeleteMode: ['urls'] },
				},
				default: '[]',
				description: 'JSON array of stored artwork or preview URLs to delete',
			},
			{
				displayName: 'Mockup UUID',
				name: 'artworkDeleteMockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['deleteArtworks'],
						artworkDeleteMode: ['mockup'],
					},
				},
				default: '',
				description: 'Delete all stored artwork belonging to this mockup',
			},

			// ============================================
			// WEBHOOK ENDPOINT PARAMETERS
			// ============================================
			{
				displayName: 'Endpoint URL',
				name: 'webhookEndpointUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['webhookCreate'],
					},
				},
				default: '',
				placeholder: 'https://your-app.com/webhooks/sudomock',
				description: 'HTTPS URL that SudoMock will POST signed events to',
			},
			{
				displayName: 'Description',
				name: 'webhookDescription',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['webhookCreate'],
					},
				},
				default: '',
				description: 'Optional human-readable label for this endpoint',
			},
			{
				displayName: 'Events',
				name: 'webhookEvents',
				type: 'multiOptions',
				displayOptions: {
					show: {
						operation: ['webhookCreate', 'webhookUpdate'],
					},
				},
				options: WEBHOOK_EVENT_OPTIONS,
				default: [],
				description:
					'Events this endpoint receives. Leave empty to subscribe to all events, including ones added in the future.',
			},
			{
				displayName: 'Webhook Endpoint ID',
				name: 'webhookId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'webhookGet',
							'webhookUpdate',
							'webhookDelete',
							'webhookRotateSecret',
							'webhookTest',
							'webhookListDeliveries',
							'webhookReplayDelivery',
							'webhookReplayFailed',
						],
					},
				},
				default: '',
				description: 'ID of the webhook endpoint (from Webhook: List Endpoints)',
			},
			{
				displayName: 'Update Fields',
				name: 'webhookUpdateFields',
				type: 'collection',
				placeholder: 'Add Field',
				displayOptions: {
					show: {
						operation: ['webhookUpdate'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'New human-readable label for the endpoint',
					},
					{
						displayName: 'Enabled',
						name: 'enabled',
						type: 'boolean',
						default: true,
						description: 'Whether the endpoint is active and receives deliveries',
					},
					{
						displayName: 'Endpoint URL',
						name: 'url',
						type: 'string',
						default: '',
						placeholder: 'https://your-app.com/webhooks/sudomock',
						description: 'New HTTPS URL for the endpoint',
					},
				],
			},
			{
				displayName: 'Delivery ID',
				name: 'webhookDeliveryId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['webhookReplayDelivery'],
					},
				},
				default: '',
				description: 'ID of the delivery to replay (from Webhook: List Deliveries)',
			},
			{
				displayName: 'Filters',
				name: 'webhookDeliveriesFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				displayOptions: {
					show: {
						operation: ['webhookListDeliveries'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Pending', value: 'pending' },
							{ name: 'Delivered', value: 'delivered' },
							{ name: 'Failed', value: 'failed' },
							{ name: 'Dead', value: 'dead' },
						],
						default: 'delivered',
						description: 'Only return deliveries with this status',
					},
					{
						displayName: 'Event Type',
						name: 'eventType',
						type: 'options',
						options: WEBHOOK_EVENT_OPTIONS,
						default: 'render.succeeded',
						description: 'Only return deliveries for this event type',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 200,
						},
						default: 50,
						description: 'Max number of results to return',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'webhookEventsFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				displayOptions: {
					show: {
						operation: ['webhookEventsFeed'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Pending', value: 'pending' },
							{ name: 'Delivered', value: 'delivered' },
							{ name: 'Failed', value: 'failed' },
							{ name: 'Dead', value: 'dead' },
						],
						default: 'delivered',
						description: 'Only return deliveries with this status',
					},
					{
						displayName: 'Event Type',
						name: 'eventType',
						type: 'options',
						options: WEBHOOK_EVENT_OPTIONS,
						default: 'render.succeeded',
						description: 'Only return deliveries for this event type',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 200,
						},
						default: 50,
						description: 'Max number of results to return',
					},
				],
			},

			// ============================================
			// LIST MOCKUPS PARAMETERS
			// ============================================
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['listMockups'],
					},
				},
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['listMockups'],
						returnAll: [false],
					},
				},
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				default: 50,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				displayOptions: {
					show: {
						operation: ['listMockups'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Created After',
						name: 'created_after',
						type: 'dateTime',
						default: '',
						description: 'Filter mockups created after this date',
					},
					{
						displayName: 'Created Before',
						name: 'created_before',
						type: 'dateTime',
						default: '',
						description: 'Filter mockups created before this date',
					},
					{
						displayName: 'Filter by Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Filter mockups by name (case-insensitive, partial match)',
					},
					{
						displayName: 'Sort By',
						name: 'sort',
						type: 'options',
						options: [
							{ name: 'Created At', value: 'created_at' },
							{ name: 'Updated At', value: 'updated_at' },
							{ name: 'Name', value: 'name' },
						],
						default: 'created_at',
						description: 'Field to sort results by',
					},
					{
						displayName: 'Sort Order',
						name: 'order',
						type: 'options',
						options: [
							{ name: 'Ascending', value: 'asc' },
							{ name: 'Descending', value: 'desc' },
						],
						default: 'desc',
						description: 'Sort order for results',
					},
				],
			},

			// ============================================
			// GET MOCKUP PARAMETERS
			// ============================================
			{
				displayName: 'Mockup UUID',
				name: 'getMockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['getMockup'],
					},
				},
				default: '',
				placeholder: 'c315f78f-d2c7-4541-b240-a9372842de94',
				description: 'UUID of the mockup template to retrieve',
			},

			// ============================================
			// UPDATE MOCKUP PARAMETERS
			// ============================================
			{
				displayName: 'Mockup UUID',
				name: 'updateMockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['updateMockup'],
					},
				},
				default: '',
				placeholder: 'c315f78f-d2c7-4541-b240-a9372842de94',
				description: 'UUID of the mockup template to update',
			},
			{
				displayName: 'New Name',
				name: 'newName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['updateMockup'],
					},
				},
				default: '',
				placeholder: 'Updated Mockup Name',
				description: 'New name for the mockup template',
			},

			// ============================================
			// DELETE MOCKUP PARAMETERS
			// ============================================
			{
				displayName: 'Mockup UUID',
				name: 'deleteMockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['deleteMockup'],
					},
				},
				default: '',
				description: 'UUID of the mockup template to delete',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				// ========================================
				// UPLOAD PSD
				// ========================================
				if (operation === 'uploadPsd') {
					const psdFileUrl = this.getNodeParameter('psdFileUrl', i) as string;
					const psdName = this.getNodeParameter('psdName', i) as string;
					const uploadIsAsync = this.getNodeParameter('uploadIsAsync', i, false) as boolean;

					const body: Record<string, string | boolean> = {
						psd_file_url: psdFileUrl,
					};

					if (psdName) {
						body.psd_name = psdName;
					}
					if (uploadIsAsync) {
						body.is_async = true;
					}

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/psd/upload',
							body,
							json: true,
						},
					);

					// Response: { success: true, data: { uuid, name, thumbnail, smart_objects, ... } }
					returnData.push({
						json: response,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// 2D: CREATE MOCKUP
				// ========================================
				else if (operation === 'create2DMockup') {
					const sourceMode = this.getNodeParameter('twoDSourceMode', i) as string;
					const name = this.getNodeParameter('twoDName', i, '') as string;
					const isAsync = this.getNodeParameter('twoDCreateIsAsync', i, false) as boolean;
					const printAreas = this.getNodeParameter(
						'twoDSetPrintAreas.items',
						i,
						[],
					) as TwoDPrintAreaPoints[];
					const body: Record<string, unknown> = {};

					if (sourceMode === 'base64') {
						body.source_base64 = this.getNodeParameter('twoDSourceBase64', i) as string;
					} else {
						body.source_url = this.getNodeParameter('twoDSourceUrl', i) as string;
					}
					if (name) {
						body.name = name;
					}
					if (isAsync) {
						body.is_async = true;
					}
					if (printAreas.length > 0) {
						body.print_areas = format2DPrintAreas(printAreas);
					}

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockups',
							body,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// 2D: GET MOCKUP
				// ========================================
				else if (operation === 'get2DMockup') {
					const mockupUuid = this.getNodeParameter('twoDMockupUuid', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: `https://api.sudomock.com/api/v1/sudoai/2d-mockups/${mockupUuid}`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// 2D: LIST MOCKUPS
				// ========================================
				else if (operation === 'list2DMockups') {
					const limit = this.getNodeParameter('twoDListLimit', i, 20) as number;
					const offset = this.getNodeParameter('twoDListOffset', i, 0) as number;
					const customizableOnly = this.getNodeParameter(
						'twoDListCustomizableOnly',
						i,
						false,
					) as boolean;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockups',
							qs: {
								limit,
								offset,
								customizable_only: customizableOnly,
							},
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// 2D: SET PRINT AREAS
				// ========================================
				else if (operation === 'set2DPrintAreas') {
					const mockupUuid = this.getNodeParameter('twoDMockupUuid', i) as string;
					const printAreas = this.getNodeParameter(
						'twoDSetPrintAreas.items',
						i,
						[],
					) as TwoDPrintAreaPoints[];
					const body = { print_areas: format2DPrintAreas(printAreas) };
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'PUT',
							url: `https://api.sudomock.com/api/v1/sudoai/2d-mockups/${mockupUuid}/print-areas`,
							body,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// 2D: RENDER MOCKUP
				// ========================================
				else if (operation === 'render2DMockup') {
					const mockupUuid = this.getNodeParameter('twoDMockupUuid', i) as string;
					const printAreasData = this.getNodeParameter(
						'twoDRenderPrintAreas.items',
						i,
						[],
					) as TwoDRenderTarget[];
					const printAreas = printAreasData.map((area) => {
						const targetType = area.targetType ?? 'savedPrintArea';
						const targetValue = targetType === 'fullSurface' ? area.surfaceUuid : area.uuid;
						if (!targetValue) {
							throw new NodeOperationError(
								this.getNode(),
								targetType === 'fullSurface'
									? 'Full-Surface UUID is required for a full-surface render target'
									: 'Saved Print Area UUID is required for a saved print-area render target',
							);
						}
						const printArea: Record<string, unknown> =
							targetType === 'fullSurface' ? { surface_uuid: targetValue } : { uuid: targetValue };
						if (area.artworkSource === 'base64') {
							printArea.base64 = area.base64;
						} else {
							printArea.artwork_url = area.artworkUrl;
						}
						if (area.removeBackground) {
							printArea.remove_background = true;
						}
						if (area.color) {
							printArea.color = area.color;
						}
						if (area.adjustments && Object.keys(area.adjustments).length > 0) {
							const { brightness, contrast, opacity, saturation, vibrance, blur, blend_mode } =
								area.adjustments;
							printArea.adjustments = Object.fromEntries(
								Object.entries({
									brightness,
									contrast,
									opacity,
									saturation,
									vibrance,
									blur,
									blend_mode,
								}).filter(([, value]) => value !== undefined),
							);
						}
						if (area.placement && Object.keys(area.placement).length > 0) {
							printArea.placement = area.placement;
						}
						return printArea;
					});
					const exportOptions = this.getNodeParameter('twoDExportOptions', i, {}) as IDataObject;
					const isAsync = this.getNodeParameter('twoDRenderIsAsync', i, false) as boolean;
					const body: Record<string, unknown> = {
						print_areas: printAreas,
					};
					if (Object.keys(exportOptions).length > 0) {
						body.export_options = exportOptions;
					}
					if (isAsync) {
						body.is_async = true;
					}

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: `https://api.sudomock.com/api/v1/sudoai/2d-mockups/${mockupUuid}/render`,
							body,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// 2D: DELETE MOCKUP
				// ========================================
				else if (operation === 'delete2DMockup') {
					const mockupUuid = this.getNodeParameter('twoDMockupUuid', i) as string;
					await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
						method: 'DELETE',
						url: `https://api.sudomock.com/api/v1/sudoai/2d-mockups/${mockupUuid}`,
					});
					returnData.push({
						json: {
							success: true,
							message: '2D mockup deleted successfully',
							mockupUuid,
							statusCode: 204,
						} as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// FONTS
				// ========================================
				else if (operation === 'listFonts') {
					const filters = this.getNodeParameter('fontFilters', i, {}) as {
						page?: number;
						perPage?: number;
						category?: string;
						search?: string;
						scope?: string;
					};
					const qs: IDataObject = {};
					if (filters.page !== undefined) qs.page = filters.page;
					if (filters.perPage !== undefined) qs.per_page = filters.perPage;
					if (filters.category) qs.category = filters.category;
					if (filters.search) qs.search = filters.search;
					if (filters.scope) qs.scope = filters.scope;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: 'https://api.sudomock.com/api/v1/fonts',
							qs,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				} else if (operation === 'getFont') {
					const fontUuid = this.getNodeParameter('fontUuid', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: `https://api.sudomock.com/api/v1/fonts/${fontUuid}`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				} else if (operation === 'uploadFont') {
					const licenseConfirmed = this.getNodeParameter(
						'fontLicenseConfirmed',
						i,
						false,
					) as boolean;
					if (!licenseConfirmed) {
						throw new NodeOperationError(
							this.getNode(),
							'Confirm you have the right to use and embed this font',
						);
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/fonts',
							body: {
								url: this.getNodeParameter('fontUrl', i) as string,
								license_confirmed: true,
							},
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				} else if (operation === 'deleteFont') {
					const fontUuid = this.getNodeParameter('fontUuid', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'DELETE',
							url: `https://api.sudomock.com/api/v1/fonts/${fontUuid}`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// BACKGROUND REMOVAL
				// ========================================
				else if (operation === 'removeBackground') {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/remove-background',
							body: {
								url: this.getNodeParameter('removeBackgroundImageUrl', i) as string,
							},
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// ARTWORKS
				// ========================================
				else if (operation === 'deleteArtworks') {
					const mode = this.getNodeParameter('artworkDeleteMode', i) as string;
					const body: Record<string, unknown> = {};
					if (mode === 'mockup') {
						body.mockup_uuid = this.getNodeParameter('artworkDeleteMockupUuid', i) as string;
					} else {
						const urls = parseJsonArray.call(
							this,
							this.getNodeParameter('artworkDeleteUrls', i, []),
							'URLs',
						);
						if (urls.length === 0 || !urls.every((url) => typeof url === 'string')) {
							throw new NodeOperationError(this.getNode(), 'URLs must contain at least one URL');
						}
						body.urls = urls;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/artworks/delete',
							body,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// RENDER MOCKUP
				// ========================================
				else if (operation === 'render') {
					const mockupUuid = this.getNodeParameter('mockupUuid', i) as string;
					const smartObjectsData = this.getNodeParameter('smartObjects.items', i, []) as Array<{
						uuid: string;
						assetUrl: string;
						fit: string;
						additionalOptions?: {
							rotate?: number;
							base64?: string;
							contentType?: string;
							removeBackground?: boolean;
							sizeWidth?: number;
							sizeHeight?: number;
							positionTop?: number;
							positionLeft?: number;
							colorHex?: string;
							colorBlendMode?: string;
							brightness?: number;
							contrast?: number;
							opacity?: number;
							saturation?: number;
							vibrance?: number;
							blur?: number;
						};
					}>;
					const textLayers = parseJsonArray.call(
						this,
						this.getNodeParameter('textLayers', i, []),
						'Text Layers',
					) as Array<Record<string, unknown>>;
					const exportOptions = this.getNodeParameter('exportOptions', i, {}) as {
						imageFormat?: string;
						imageSize?: number;
						quality?: number;
						dpi?: number;
						exportLabel?: string;
					};

					// Convert smart objects array to API format
					const smartObjects = smartObjectsData.map((so) => {
						const smartObject: Record<string, unknown> = {
							uuid: so.uuid,
							asset: {
								url: so.assetUrl,
								fit: so.fit,
							},
						};

						// Add additional options if present
						if (so.additionalOptions) {
							const opts = so.additionalOptions;
							const asset = smartObject.asset as Record<string, unknown>;

							// Rotation
							if (opts.rotate !== undefined && opts.rotate !== 0) {
								asset.rotate = opts.rotate;
							}

							// Base64 image source (alternative to URL, takes priority server-side)
							if (opts.base64) {
								asset.base64 = opts.base64;
								if (opts.contentType) {
									asset.content_type = opts.contentType;
								}
							}

							// Background removal surcharge, billed per unique artwork source
							if (opts.removeBackground) {
								asset.remove_background = true;
							}

							// Custom size override
							const size: Record<string, number> = {};
							if (opts.sizeWidth !== undefined && opts.sizeWidth > 0) {
								size.width = opts.sizeWidth;
							}
							if (opts.sizeHeight !== undefined && opts.sizeHeight > 0) {
								size.height = opts.sizeHeight;
							}
							if (Object.keys(size).length > 0) {
								asset.size = size;
							}

							// Custom position override (top/left, DynamicMockups compatible)
							const position: Record<string, number> = {};
							if (opts.positionTop !== undefined && opts.positionTop !== 0) {
								position.top = opts.positionTop;
							}
							if (opts.positionLeft !== undefined && opts.positionLeft !== 0) {
								position.left = opts.positionLeft;
							}
							if (Object.keys(position).length > 0) {
								asset.position = position;
							}

							// Color overlay
							if (opts.colorHex) {
								smartObject.color = {
									hex: opts.colorHex,
									blending_mode: opts.colorBlendMode || 'normal',
								};
							}

							// Adjustment layers
							const adjustments: Record<string, number> = {};
							if (opts.brightness !== undefined && opts.brightness !== 0) {
								adjustments.brightness = opts.brightness;
							}
							if (opts.contrast !== undefined && opts.contrast !== 0) {
								adjustments.contrast = opts.contrast;
							}
							if (opts.opacity !== undefined && opts.opacity !== 100) {
								adjustments.opacity = opts.opacity;
							}
							if (opts.saturation !== undefined && opts.saturation !== 0) {
								adjustments.saturation = opts.saturation;
							}
							if (opts.vibrance !== undefined && opts.vibrance !== 0) {
								adjustments.vibrance = opts.vibrance;
							}
							if (opts.blur !== undefined && opts.blur !== 0) {
								adjustments.blur = opts.blur;
							}
							if (Object.keys(adjustments).length > 0) {
								smartObject.adjustment_layers = adjustments;
							}
						}

						return smartObject;
					});

					// Request body
					const isAsync = this.getNodeParameter('isAsync', i, false) as boolean;
					const body: Record<string, unknown> = {
						mockup_uuid: mockupUuid,
						smart_objects: smartObjects,
					};
					if (textLayers.length > 0) {
						body.text_layers = textLayers;
					}
					if (smartObjects.length === 0 && textLayers.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'Add at least one smart object or text layer override',
						);
					}
					if (isAsync) {
						body.is_async = true;
					}

					// Export options
					if (Object.keys(exportOptions).length > 0) {
						const expOpts: Record<string, unknown> = {};
						if (exportOptions.imageFormat) {
							expOpts.image_format = exportOptions.imageFormat;
						}
						if (exportOptions.imageSize) {
							expOpts.image_size = exportOptions.imageSize;
						}
						if (exportOptions.quality) {
							expOpts.quality = exportOptions.quality;
						}
						if (exportOptions.dpi) {
							expOpts.dpi = exportOptions.dpi;
						}
						if (Object.keys(expOpts).length > 0) {
							body.export_options = expOpts;
						}
						if (exportOptions.exportLabel) {
							body.export_label = exportOptions.exportLabel;
						}
					}

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/renders',
							body,
							json: true,
						},
					);

					// Response: { success: true, data: { print_files: [{ export_path, smart_object_uuid }] } }
					// Make export paths more easily accessible
					const outputJson: IDataObject = { ...response } as IDataObject;

					if (response.data?.print_files?.length > 0) {
						// Extract first rendered image URL to top level
						outputJson.renderedImageUrl = response.data.print_files[0].export_path;

						// Also add all URLs as an array
						outputJson.allRenderedUrls = response.data.print_files.map(
							(pf: { export_path: string }) => pf.export_path,
						);
					}

					returnData.push({
						json: outputJson,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// RENDER VIDEO (always async)
				// ========================================
				else if (operation === 'renderVideo') {
					const inputMode = this.getNodeParameter('videoInputMode', i, 'render') as string;
					const videoOptions = this.getNodeParameter('videoOptions', i, {}) as {
						durationSeconds?: number;
						audio?: boolean;
						motion?: string;
						advancedModel?: string;
					};
					const videoWebhookUrl = this.getNodeParameter('videoWebhookUrl', i, '') as string;

					const body: Record<string, unknown> = {};
					if (inputMode === 'image') {
						body.image_url = this.getNodeParameter('videoImageUrl', i) as string;
					} else {
						const mockupUuid = this.getNodeParameter('videoMockupUuid', i) as string;
						const smartObjectsData = this.getNodeParameter(
							'videoSmartObjects.items',
							i,
							[],
						) as Array<{
							uuid: string;
							assetUrl: string;
							fit: string;
						}>;
						body.mockup_uuid = mockupUuid;
						body.smart_objects = smartObjectsData.map((so) => ({
							uuid: so.uuid,
							asset: { url: so.assetUrl, fit: so.fit },
						}));
					}

					const video: Record<string, unknown> = {};
					if (videoOptions.durationSeconds !== undefined) {
						video.duration_seconds = videoOptions.durationSeconds;
					}
					if (videoOptions.audio !== undefined) {
						video.audio = videoOptions.audio;
					}
					if (videoOptions.motion) {
						video.motion = videoOptions.motion;
					}
					if (videoOptions.advancedModel) {
						video.advanced_model = videoOptions.advancedModel;
					}
					if (Object.keys(video).length > 0) {
						body.video = video;
					}
					if (videoWebhookUrl) {
						body.webhook = { url: videoWebhookUrl };
					}

					const accepted = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/renders/video',
							body,
							json: true,
						},
					);

					const waitForCompletion = this.getNodeParameter(
						'videoWaitForCompletion',
						i,
						false,
					) as boolean;

					if (waitForCompletion && accepted?.job_id) {
						const timeout = this.getNodeParameter('videoPollTimeout', i, 300) as number;
						const job = await pollJob.call(this, accepted.job_id as string, timeout);
						const out: IDataObject = { ...(job as IDataObject) };
						if (job?.result_url) {
							out.resultUrl = job.result_url;
						}
						returnData.push({ json: out, pairedItem: { item: i } });
					} else {
						returnData.push({
							json: accepted as IDataObject,
							pairedItem: { item: i },
						});
					}
				}

				// ========================================
				// GET JOB
				// ========================================
				else if (operation === 'getJob') {
					const jobId = this.getNodeParameter('jobId', i) as string;
					const waitForCompletion = this.getNodeParameter(
						'jobWaitForCompletion',
						i,
						false,
					) as boolean;

					let job: IDataObject;
					if (waitForCompletion) {
						const timeout = this.getNodeParameter('jobPollTimeout', i, 300) as number;
						job = (await pollJob.call(this, jobId, timeout)) as IDataObject;
					} else {
						job = (await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
							method: 'GET',
							url: `https://api.sudomock.com/api/v1/jobs/${jobId}`,
							json: true,
						})) as IDataObject;
					}

					// Surface the result for convenience: result_url (render/video) or mockup_uuid (upload).
					const out: IDataObject = { ...job };
					if (job.kind === 'upload' && job.mockup_uuid) {
						out.resultMockupUuid = job.mockup_uuid;
					} else if (job.result_url) {
						out.resultUrl = job.result_url;
					}

					returnData.push({ json: out, pairedItem: { item: i } });
				}

				// ========================================
				// LIST JOBS
				// ========================================
				else if (operation === 'listJobs') {
					const filters = this.getNodeParameter('listJobsFilters', i, {}) as {
						kind?: string;
						mockupUuid?: string;
						limit?: number;
						cursor?: string;
					};
					const qs: IDataObject = {};
					if (filters.kind) {
						qs.kind = filters.kind;
					}
					if (filters.mockupUuid) {
						qs.mockup_uuid = filters.mockupUuid;
					}
					if (filters.limit !== undefined) {
						qs.limit = filters.limit;
					}
					if (filters.cursor) {
						qs.cursor = filters.cursor;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: 'https://api.sudomock.com/api/v1/jobs',
							qs,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: LIST ENDPOINTS
				// ========================================
				else if (operation === 'webhookList') {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: 'https://api.sudomock.com/api/v1/webhook-endpoints',
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: EVENTS FEED
				// ========================================
				else if (operation === 'webhookEventsFeed') {
					const filters = this.getNodeParameter('webhookEventsFilters', i, {}) as {
						status?: string;
						eventType?: string;
						limit?: number;
					};
					const qs: IDataObject = {};
					if (filters.status) {
						qs.status = filters.status;
					}
					if (filters.eventType) {
						qs.event_type = filters.eventType;
					}
					if (filters.limit !== undefined) {
						qs.limit = filters.limit;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: 'https://api.sudomock.com/api/v1/webhook-endpoints/events',
							qs,
							json: true,
						},
					);
					returnData.push({
						json: { deliveries: response } as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: GET ENDPOINT
				// ========================================
				else if (operation === 'webhookGet') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: CREATE ENDPOINT
				// ========================================
				else if (operation === 'webhookCreate') {
					const url = this.getNodeParameter('webhookEndpointUrl', i) as string;
					const events = this.getNodeParameter('webhookEvents', i, []) as string[];
					const description = this.getNodeParameter('webhookDescription', i, '') as string;
					const body: Record<string, unknown> = { url };
					if (description) {
						body.description = description;
					}
					if (events.length > 0) {
						body.event_types = events;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/webhook-endpoints',
							body,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: UPDATE ENDPOINT
				// ========================================
				else if (operation === 'webhookUpdate') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const events = this.getNodeParameter('webhookEvents', i, []) as string[];
					const updateFields = this.getNodeParameter('webhookUpdateFields', i, {}) as {
						url?: string;
						description?: string;
						enabled?: boolean;
					};
					const body: Record<string, unknown> = {};
					if (updateFields.url) {
						body.url = updateFields.url;
					}
					if (updateFields.description !== undefined) {
						body.description = updateFields.description;
					}
					if (updateFields.enabled !== undefined) {
						body.enabled = updateFields.enabled;
					}
					if (events.length > 0) {
						body.event_types = events;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'PATCH',
							url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}`,
							body,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: DELETE ENDPOINT
				// ========================================
				else if (operation === 'webhookDelete') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
						method: 'DELETE',
						url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}`,
					});
					returnData.push({
						json: {
							success: true,
							message: 'Webhook endpoint deleted successfully',
							webhookId,
							statusCode: 204,
						} as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: ROTATE SECRET
				// ========================================
				else if (operation === 'webhookRotateSecret') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}/rotate-secret`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: SEND TEST
				// ========================================
				else if (operation === 'webhookTest') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}/test`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: LIST DELIVERIES
				// ========================================
				else if (operation === 'webhookListDeliveries') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const filters = this.getNodeParameter('webhookDeliveriesFilters', i, {}) as {
						status?: string;
						eventType?: string;
						limit?: number;
					};
					const qs: IDataObject = {};
					if (filters.status) {
						qs.status = filters.status;
					}
					if (filters.eventType) {
						qs.event_type = filters.eventType;
					}
					if (filters.limit !== undefined) {
						qs.limit = filters.limit;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}/deliveries`,
							qs,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: REPLAY DELIVERY
				// ========================================
				else if (operation === 'webhookReplayDelivery') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const deliveryId = this.getNodeParameter('webhookDeliveryId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}/deliveries/${deliveryId}/replay`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// WEBHOOK: REPLAY FAILED DELIVERIES
				// ========================================
				else if (operation === 'webhookReplayFailed') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: `https://api.sudomock.com/api/v1/webhook-endpoints/${webhookId}/deliveries/replay-failed`,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// GET ACCOUNT INFO
				// ========================================
				else if (operation === 'getAccountInfo') {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: 'https://api.sudomock.com/api/v1/me',
							json: true,
						},
					);

					returnData.push({
						json: response,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// LIST MOCKUPS
				// ========================================
				else if (operation === 'listMockups') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as {
						name?: string;
						created_after?: string;
						created_before?: string;
						sort?: string;
						order?: string;
					};

					let allMockups: IDataObject[] = [];
					let offset = 0;
					const limit = returnAll ? 100 : (this.getNodeParameter('limit', i) as number);

					do {
						// Build query parameters
						const queryParams: Record<string, string> = {
							limit: limit.toString(),
							offset: offset.toString(),
						};

						if (additionalOptions.name) {
							queryParams.name = additionalOptions.name;
						}
						if (additionalOptions.created_after) {
							queryParams.created_after = additionalOptions.created_after;
						}
						if (additionalOptions.created_before) {
							queryParams.created_before = additionalOptions.created_before;
						}
						if (additionalOptions.sort) {
							queryParams.sort = additionalOptions.sort;
						}
						if (additionalOptions.order) {
							queryParams.order = additionalOptions.order;
						}

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'sudoMockApi',
							{
								method: 'GET',
								url: 'https://api.sudomock.com/api/v1/mockups',
								qs: queryParams,
								json: true,
							},
						);

						const mockups = response.data?.mockups || [];
						allMockups = allMockups.concat(mockups);

						if (!returnAll || mockups.length < limit) {
							break;
						}

						offset += limit;
					} while (returnAll);

					// Return all mockups as separate items
					allMockups.forEach((mockup) => {
						returnData.push({
							json: mockup as IDataObject,
							pairedItem: { item: i },
						});
					});
				}

				// ========================================
				// GET MOCKUP
				// ========================================
				else if (operation === 'getMockup') {
					const mockupUuid = this.getNodeParameter('getMockupUuid', i) as string;

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: `https://api.sudomock.com/api/v1/mockups/${mockupUuid}`,
							json: true,
						},
					);

					returnData.push({
						json: response,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// UPDATE MOCKUP
				// ========================================
				else if (operation === 'updateMockup') {
					const mockupUuid = this.getNodeParameter('updateMockupUuid', i) as string;
					const newName = this.getNodeParameter('newName', i) as string;

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'PATCH',
							url: `https://api.sudomock.com/api/v1/mockups/${mockupUuid}`,
							body: {
								name: newName,
							},
							json: true,
						},
					);

					returnData.push({
						json: response,
						pairedItem: { item: i },
					});
				}

				// ========================================
				// DELETE MOCKUP
				// ========================================
				else if (operation === 'deleteMockup') {
					const mockupUuid = this.getNodeParameter('deleteMockupUuid', i) as string;

					await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
						method: 'DELETE',
						url: `https://api.sudomock.com/api/v1/mockups/${mockupUuid}`,
						// No json: true - DELETE returns 204 No Content (no body)
					});

					// Create manual success response for 204 No Content
					returnData.push({
						json: {
							success: true,
							message: 'Mockup deleted successfully',
							mockupUuid: mockupUuid,
							statusCode: 204,
						} as IDataObject,
						pairedItem: { item: i },
					});
				}
			} catch (error: any) {
				// Enhanced rate limit error handling
				if (error.statusCode === 429) {
					const headers = error.response?.headers || {};
					const retryAfter = headers['retry-after'] || headers['Retry-After'] || '60';
					const rateLimitReset = headers['ratelimit-reset'] || headers['RateLimit-Reset'];
					const errorBody = error.response?.body?.error || {};
					const errorType = errorBody.type;

					// Construct user-friendly error message
					let errorMessage = '';
					if (errorType === 'concurrent_limit_exceeded') {
						const resource = errorBody.resource?.replace('concurrent-', '') || 'request';
						errorMessage = `Concurrent ${resource} limit reached (${errorBody.current}/${errorBody.limit}). Please wait ${retryAfter} seconds and try again.`;
					} else {
						errorMessage = `Rate limit exceeded (${errorBody.limit} requests/minute). Please retry after ${retryAfter} seconds.`;
					}

					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: errorMessage,
								operation,
								statusCode: 429,
								retryAfter: parseInt(retryAfter),
								rateLimitReset: rateLimitReset ? parseInt(rateLimitReset) : undefined,
								errorType: errorType || 'rate_limit_exceeded',
								errorDetails: errorBody,
							} as IDataObject,
							pairedItem: { item: i },
						});
						continue;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						message: errorMessage,
						httpCode: '429',
						itemIndex: i,
					});
				}

				// Handle other errors
				if (this.continueOnFail()) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					returnData.push({
						json: {
							error: errorMessage,
							operation,
							statusCode: error.statusCode,
						} as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}
				// NodeApiError for HTTP errors, NodeOperationError for non-HTTP logic errors
				if (error.statusCode) {
					throw new NodeApiError(this.getNode(), (error.response?.body ?? error) as JsonObject, {
						httpCode: String(error.statusCode),
						itemIndex: i,
					});
				}
				throw new NodeOperationError(
					this.getNode(),
					error instanceof Error ? error : new Error('Unknown error'),
					{
						itemIndex: i,
					},
				);
			}
		}

		return [returnData];
	}
}
