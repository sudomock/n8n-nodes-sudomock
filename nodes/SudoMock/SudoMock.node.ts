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
} from 'n8n-workflow';

const TERMINAL_JOB_STATUSES = ['succeeded', 'failed', 'cancelled'];

/**
 * Poll GET /api/v1/jobs/{render_uuid} until the job reaches a terminal status
 * (succeeded, failed, cancelled) or the timeout elapses. Uses a capped backoff.
 */
async function pollJob(
	this: IExecuteFunctions,
	renderUuid: string,
	timeoutSeconds: number,
): Promise<IDataObject> {
	const deadline = Date.now() + timeoutSeconds * 1000;
	let delayMs = 1500;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const job = (await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
			method: 'GET',
			url: `https://api.sudomock.com/api/v1/jobs/${renderUuid}`,
			json: true,
		})) as IDataObject;

		if (typeof job.status === 'string' && TERMINAL_JOB_STATUSES.includes(job.status)) {
			return job;
		}

		if (Date.now() + delayMs >= deadline) {
			throw new NodeOperationError(
				this.getNode(),
				`Timed out after ${timeoutSeconds}s waiting for job ${renderUuid} (last status: ${job.status ?? 'unknown'})`,
			);
		}

		await new Promise((resolve) => setTimeout(resolve, delayMs));
		delayMs = Math.min(delayMs * 1.5, 8000);
	}
}

export class SudoMock implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SudoMock',
		name: 'sudoMock',
		icon: 'file:sudomock.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Generate mockups and product videos for Print-on-Demand automation. Upload PSDs, render with your designs, render videos, run renders asynchronously, track jobs, and manage webhooks.',
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
						name: 'Delete Mockup',
						value: 'deleteMockup',
						description: 'Delete a specific mockup template',
						action: 'Delete a mockup',
					},
					{
						name: 'Get Account Info',
						value: 'getAccountInfo',
						description: 'Get account details, subscription, and usage statistics',
						action: 'Get account information',
					},
					{
						name: 'Get Mockup',
						value: 'getMockup',
						description: 'Get details of a specific mockup template',
						action: 'Get mockup details',
					},
					{
						name: 'List Mockups',
						value: 'listMockups',
						description: 'List all your uploaded mockup templates',
						action: 'List mockups',
					},
					{
						name: 'Get Job',
						value: 'getJob',
						description: 'Get the status and result of an async job by its render UUID',
						action: 'Get a job',
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
				description: "Public URL to your PSD file (up to Adobe's official PSD file size limit). Use S3, GCS, or any public URL.",
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
							{
								displayName: 'Additional Options',
								name: 'additionalOptions',
								type: 'collection',
								placeholder: 'Add Option',
								default: {},
								options: [
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
										displayName: 'Color Overlay (Hex)',
										name: 'colorHex',
										type: 'string',
										default: '',
										placeholder: '#FF5733',
										description: 'Apply color overlay to the design',
									},
									{
										displayName: 'Color Blend Mode',
										name: 'colorBlendMode',
										type: 'options',
										options: [
											{ name: 'Normal', value: 'normal' },
											{ name: 'Multiply', value: 'multiply' },
											{ name: 'Screen', value: 'screen' },
											{ name: 'Overlay', value: 'overlay' },
											{ name: 'Darken', value: 'darken' },
											{ name: 'Lighten', value: 'lighten' },
											{ name: 'Color Dodge', value: 'color-dodge' },
											{ name: 'Color Burn', value: 'color-burn' },
											{ name: 'Hard Light', value: 'hard-light' },
											{ name: 'Soft Light', value: 'soft-light' },
										],
										default: 'multiply',
										description: 'Blend mode for color overlay',
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
								],
							},
						],
					},
				],
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
						default: 1920,
						description: 'Output width in pixels (100-10000). Height scales proportionally.',
					},
					{
						displayName: 'Quality',
						name: 'quality',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 100,
						},
						default: 95,
						description: 'Quality for JPG/WebP output (1-100)',
					},
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
					'Whether to process the render in the background. Returns a render_uuid (kind: render) immediately instead of the inline result. Track it with the Get Job operation.',
			},

			// ============================================
			// RENDER VIDEO PARAMETERS
			// ============================================
			{
				displayName: 'Mockup UUID',
				name: 'videoMockupUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['renderVideo'],
					},
				},
				default: '',
				placeholder: 'c315f78f-d2c7-4541-b240-a9372842de94',
				description: 'UUID of the uploaded mockup template to animate',
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
									{ name: 'Fill', value: 'fill', description: 'Stretch to fill entire area' },
									{ name: 'Contain', value: 'contain', description: 'Fit inside, may leave space' },
									{ name: 'Cover', value: 'cover', description: 'Fill area, may crop edges (recommended)' },
								],
								default: 'cover',
								description: 'How to fit the design in the smart object bounds',
							},
						],
					},
				],
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
						},
						default: 5,
						description: 'Length of the clip in seconds. Longer clips cost more credits.',
					},
					{
						displayName: 'Audio',
						name: 'audio',
						type: 'boolean',
						default: true,
						description: 'Whether to include a generated audio track',
					},
					{
						displayName: 'Advanced Model',
						name: 'advancedModel',
						type: 'string',
						default: '',
						placeholder: 'video-pro',
						description:
							'Opaque identifier selecting the quality tier (e.g. video-standard, video-pro). It is an opaque label, not part of the stable contract.',
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
				displayName: 'Render UUID',
				name: 'jobRenderUuid',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['getJob'],
					},
				},
				default: '',
				placeholder: '9d4e2b51-0c7a-4f8e-bb1c-2a6f9e3d8c10',
				description: 'The render_uuid returned by an async render, upload, or video request',
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
				displayName: 'Events',
				name: 'webhookEvents',
				type: 'multiOptions',
				displayOptions: {
					show: {
						operation: ['webhookCreate', 'webhookUpdate'],
					},
				},
				options: [
					{ name: 'render.succeeded', value: 'render.succeeded' },
					{ name: 'render.failed', value: 'render.failed' },
					{ name: 'upload.succeeded', value: 'upload.succeeded' },
					{ name: 'video.succeeded', value: 'video.succeeded' },
					{ name: 'video.failed', value: 'video.failed' },
					{ name: 'webhook.test', value: 'webhook.test' },
				],
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
						displayName: 'Endpoint URL',
						name: 'url',
						type: 'string',
						default: '',
						placeholder: 'https://your-app.com/webhooks/sudomock',
						description: 'New HTTPS URL for the endpoint',
					},
					{
						displayName: 'Enabled',
						name: 'enabled',
						type: 'boolean',
						default: true,
						description: 'Whether the endpoint is active and receives deliveries',
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
				default: 20,
				description: 'Max number of results to return (1-100)',
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
						displayName: 'Filter by Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Filter mockups by name (case-insensitive, partial match)',
					},
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

					const body: Record<string, string> = {
						psd_file_url: psdFileUrl,
					};

					if (psdName) {
						body.psd_name = psdName;
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
							colorHex?: string;
							colorBlendMode?: string;
							brightness?: number;
							contrast?: number;
							opacity?: number;
						};
					}>;
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

							// Rotation
							if (opts.rotate !== undefined && opts.rotate !== 0) {
								(smartObject.asset as Record<string, unknown>).rotate = opts.rotate;
							}

							// Color overlay
							if (opts.colorHex) {
								smartObject.color = {
									hex: opts.colorHex,
									blending_mode: opts.colorBlendMode || 'multiply',
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
							(pf: { export_path: string }) => pf.export_path
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
					const mockupUuid = this.getNodeParameter('videoMockupUuid', i) as string;
					const smartObjectsData = this.getNodeParameter(
						'videoSmartObjects.items',
						i,
						[],
					) as Array<{ uuid: string; assetUrl: string; fit: string }>;
					const videoOptions = this.getNodeParameter('videoOptions', i, {}) as {
						durationSeconds?: number;
						audio?: boolean;
						advancedModel?: string;
					};

					const smartObjects = smartObjectsData.map((so) => ({
						uuid: so.uuid,
						asset: { url: so.assetUrl, fit: so.fit },
					}));

					const body: Record<string, unknown> = {
						mockup_uuid: mockupUuid,
						smart_objects: smartObjects,
					};

					const video: Record<string, unknown> = {};
					if (videoOptions.durationSeconds !== undefined) {
						video.duration_seconds = videoOptions.durationSeconds;
					}
					if (videoOptions.audio !== undefined) {
						video.audio = videoOptions.audio;
					}
					if (videoOptions.advancedModel) {
						video.advanced_model = videoOptions.advancedModel;
					}
					if (Object.keys(video).length > 0) {
						body.video = video;
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

					if (waitForCompletion && accepted?.render_uuid) {
						const timeout = this.getNodeParameter('videoPollTimeout', i, 300) as number;
						const job = await pollJob.call(this, accepted.render_uuid as string, timeout);
						const out: IDataObject = { ...(job as IDataObject) };
						if (job?.result_url) {
							out.resultUrl = job.result_url;
						}
						returnData.push({ json: out, pairedItem: { item: i } });
					} else {
						returnData.push({ json: accepted as IDataObject, pairedItem: { item: i } });
					}
				}

				// ========================================
				// GET JOB
				// ========================================
				else if (operation === 'getJob') {
					const renderUuid = this.getNodeParameter('jobRenderUuid', i) as string;
					const waitForCompletion = this.getNodeParameter(
						'jobWaitForCompletion',
						i,
						false,
					) as boolean;

					let job: IDataObject;
					if (waitForCompletion) {
						const timeout = this.getNodeParameter('jobPollTimeout', i, 300) as number;
						job = (await pollJob.call(this, renderUuid, timeout)) as IDataObject;
					} else {
						job = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'sudoMockApi',
							{
								method: 'GET',
								url: `https://api.sudomock.com/api/v1/jobs/${renderUuid}`,
								json: true,
							},
						)) as IDataObject;
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
				// WEBHOOK: LIST ENDPOINTS
				// ========================================
				else if (operation === 'webhookList') {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: 'https://api.sudomock.com/api/v1/webhooks',
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
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
							url: `https://api.sudomock.com/api/v1/webhooks/${webhookId}`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
				}

				// ========================================
				// WEBHOOK: CREATE ENDPOINT
				// ========================================
				else if (operation === 'webhookCreate') {
					const url = this.getNodeParameter('webhookEndpointUrl', i) as string;
					const events = this.getNodeParameter('webhookEvents', i, []) as string[];
					const body: Record<string, unknown> = { url };
					if (events.length > 0) {
						body.events = events;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'POST',
							url: 'https://api.sudomock.com/api/v1/webhooks',
							body,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
				}

				// ========================================
				// WEBHOOK: UPDATE ENDPOINT
				// ========================================
				else if (operation === 'webhookUpdate') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const events = this.getNodeParameter('webhookEvents', i, []) as string[];
					const updateFields = this.getNodeParameter('webhookUpdateFields', i, {}) as {
						url?: string;
						enabled?: boolean;
					};
					const body: Record<string, unknown> = {};
					if (updateFields.url) {
						body.url = updateFields.url;
					}
					if (updateFields.enabled !== undefined) {
						body.enabled = updateFields.enabled;
					}
					if (events.length > 0) {
						body.events = events;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'PATCH',
							url: `https://api.sudomock.com/api/v1/webhooks/${webhookId}`,
							body,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
				}

				// ========================================
				// WEBHOOK: DELETE ENDPOINT
				// ========================================
				else if (operation === 'webhookDelete') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
						method: 'DELETE',
						url: `https://api.sudomock.com/api/v1/webhooks/${webhookId}`,
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
							url: `https://api.sudomock.com/api/v1/webhooks/${webhookId}/rotate-secret`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
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
							url: `https://api.sudomock.com/api/v1/webhooks/${webhookId}/test`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
				}

				// ========================================
				// WEBHOOK: LIST DELIVERIES
				// ========================================
				else if (operation === 'webhookListDeliveries') {
					const webhookId = this.getNodeParameter('webhookId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'GET',
							url: `https://api.sudomock.com/api/v1/webhooks/${webhookId}/deliveries`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
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
							url: `https://api.sudomock.com/api/v1/webhooks/${webhookId}/deliveries/${deliveryId}/replay`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
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

					await this.helpers.httpRequestWithAuthentication.call(
						this,
						'sudoMockApi',
						{
							method: 'DELETE',
							url: `https://api.sudomock.com/api/v1/mockups/${mockupUuid}`,
							// No json: true - DELETE returns 204 No Content (no body)
						},
					);

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
					throw new NodeApiError(
						this.getNode(),
						error as JsonObject,
						{
							message: errorMessage,
							httpCode: '429',
							itemIndex: i,
						},
					);
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
					throw new NodeApiError(
						this.getNode(),
						(error.response?.body ?? error) as JsonObject,
						{
							httpCode: String(error.statusCode),
							itemIndex: i,
						},
					);
				}
				throw new NodeOperationError(
					this.getNode(),
					error instanceof Error ? error : new Error('Unknown error'),
					{ itemIndex: i },
				);
			}
		}

		return [returnData];
	}
}
