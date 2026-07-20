const assert = require('node:assert/strict');
const test = require('node:test');

const { SudoMock } = require('../dist/nodes/SudoMock/SudoMock.node.js');

const existingOperations = [
	'deleteMockup',
	'getAccountInfo',
	'getMockup',
	'listMockups',
	'getJob',
	'listJobs',
	'render',
	'renderVideo',
	'updateMockup',
	'uploadPsd',
	'webhookCreate',
	'webhookDelete',
	'webhookEventsFeed',
	'webhookGet',
	'webhookListDeliveries',
	'webhookList',
	'webhookReplayDelivery',
	'webhookReplayFailed',
	'webhookRotateSecret',
	'webhookTest',
	'webhookUpdate',
];

const twoDOperations = [
	'create2DMockup',
	'get2DMockup',
	'list2DMockups',
	'set2DPrintAreas',
	'render2DMockup',
	'delete2DMockup',
];

test('2D operations are well formed without removing existing operations', () => {
	const properties = new SudoMock().description.properties;
	const operation = properties.find((property) => property.name === 'operation');
	const values = operation.options.map((option) => option.value);

	assert.equal(new Set(values).size, values.length);
	for (const value of [...existingOperations, ...twoDOperations]) {
		assert.ok(values.includes(value), `missing operation ${value}`);
	}

	const propertyNames = properties.map((property) => property.name);
	assert.equal(new Set(propertyNames).size, propertyNames.length);
	for (const property of properties.filter((item) => item.name.startsWith('twoD'))) {
		assert.ok(property.displayOptions?.show?.operation, `${property.name} has no operation display option`);
	}
});

test('2D operations route to the expected API requests', async (t) => {
	const cases = [
		{
			operation: 'create2DMockup',
			parameters: {
				twoDSourceMode: 'url',
				twoDSourceUrl: 'https://cdn.example.com/product.png',
				twoDName: 'T-Shirt Front',
			},
			expected: {
				method: 'POST',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockups',
				body: {
					source_url: 'https://cdn.example.com/product.png',
					name: 'T-Shirt Front',
				},
				json: true,
			},
		},
		{
			name: 'create2DMockup with Base64',
			operation: 'create2DMockup',
			parameters: {
				twoDSourceMode: 'base64',
				twoDSourceBase64: 'aW1hZ2U=',
				twoDName: '',
			},
			expected: {
				method: 'POST',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockups',
				body: { source_base64: 'aW1hZ2U=' },
				json: true,
			},
		},
		{
			operation: 'get2DMockup',
			parameters: { twoDMockupUuid: 'mockup-1' },
			expected: {
				method: 'GET',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockup/mockup-1',
				json: true,
			},
		},
		{
			operation: 'list2DMockups',
			parameters: {},
			expected: {
				method: 'GET',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockups',
				json: true,
			},
		},
		{
			operation: 'set2DPrintAreas',
			parameters: {
				twoDMockupUuid: 'mockup-1',
				'twoDSetPrintAreas.items': [
					{
						point1X: 10,
						point1Y: 20,
						point2X: 110,
						point2Y: 20,
						point3X: 110,
						point3Y: 120,
						point4X: 10,
						point4Y: 120,
					},
				],
			},
			expected: {
				method: 'PUT',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockup/mockup-1/print-areas',
				body: {
					print_areas: [
						{
							points: [
								[10, 20],
								[110, 20],
								[110, 120],
								[10, 120],
							],
						},
					],
				},
				json: true,
			},
		},
		{
			operation: 'render2DMockup',
			parameters: {
				twoDMockupUuid: 'mockup-1',
				'twoDRenderPrintAreas.items': [
					{
						uuid: 'print-area-1',
						artworkSource: 'base64',
						base64: 'aW1hZ2U=',
						color: '#FF0000',
						adjustments: { brightness: 5, blend_mode: 'multiply' },
						placement: { position: 'center', coverage: 70 },
					},
				],
				twoDExportOptions: {
					image_format: 'png',
					image_size: 2048,
					quality: 90,
					dpi: 300,
				},
			},
			expected: {
				method: 'POST',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockup/render',
				body: {
					mockup_uuid: 'mockup-1',
					print_areas: [
						{
							uuid: 'print-area-1',
							base64: 'aW1hZ2U=',
							color: '#FF0000',
							adjustments: { brightness: 5, blend_mode: 'multiply' },
							placement: { position: 'center', coverage: 70 },
						},
					],
					export_options: {
						image_format: 'png',
						image_size: 2048,
						quality: 90,
						dpi: 300,
					},
				},
				json: true,
			},
		},
		{
			name: 'render2DMockup with artwork URL',
			operation: 'render2DMockup',
			parameters: {
				twoDMockupUuid: 'mockup-1',
				'twoDRenderPrintAreas.items': [
					{
						uuid: 'print-area-1',
						artworkSource: 'url',
						artworkUrl: 'https://cdn.example.com/design.png',
					},
				],
				twoDExportOptions: {},
			},
			expected: {
				method: 'POST',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockup/render',
				body: {
					mockup_uuid: 'mockup-1',
					print_areas: [
						{
							uuid: 'print-area-1',
							artwork_url: 'https://cdn.example.com/design.png',
						},
					],
				},
				json: true,
			},
		},
		{
			operation: 'delete2DMockup',
			parameters: { twoDMockupUuid: 'mockup-1' },
			expected: {
				method: 'DELETE',
				url: 'https://api.sudomock.com/api/v1/sudoai/2d-mockup/mockup-1',
			},
		},
	];

	for (const testCase of cases) {
		await t.test(testCase.name ?? testCase.operation, async () => {
			const calls = [];
			const response = { operation: testCase.operation };
			const context = {
				getInputData: () => [{ json: {} }],
				getNodeParameter: (name, _index, fallback) => {
					if (name === 'operation') return testCase.operation;
					return Object.prototype.hasOwnProperty.call(testCase.parameters, name)
						? testCase.parameters[name]
						: fallback;
				},
				helpers: {
					httpRequestWithAuthentication: async (_credential, options) => {
						calls.push({ credential: _credential, options });
						return response;
					},
				},
				continueOnFail: () => false,
				getNode: () => ({}),
			};

			const output = await new SudoMock().execute.call(context);

			assert.deepEqual(calls, [{ credential: 'sudoMockApi', options: testCase.expected }]);
			if (testCase.operation !== 'delete2DMockup') {
				assert.strictEqual(output[0][0].json, response);
			} else {
				assert.deepEqual(output[0][0].json, {
					success: true,
					message: '2D mockup deleted successfully',
					mockupUuid: 'mockup-1',
					statusCode: 204,
				});
			}
		});
	}
});
