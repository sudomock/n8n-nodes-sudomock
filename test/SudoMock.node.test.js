const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const NODE_DIST_PATH = path.join(__dirname, '..', 'dist', 'nodes', 'SudoMock', 'SudoMock.node.js');
const { SudoMock } = require(NODE_DIST_PATH);

// ---------------------------------------------------------------------------
// BACKEND CONTRACT (source of truth for this suite)
//
// These paths are the api.sudomock.com public surface, verified against
// mockup-generator app/main.py (public_router prefix /api/v1/sudoai) and
// app/api/routes/sudoai_2d.py, plus live probes. They are declared here
// independently of the node so the suite fails when the node drifts away
// from the backend instead of agreeing with whatever the node happens to send.
//
// The singular forms (/2d-mockup, /2d-mockup/{id}/...) are mounted only on the
// internal router (/api/v1/internal, include_in_schema=False). On the public
// surface they are retired paths that return 404: there is no alias and no
// redirect, so the node must never emit them.
// ---------------------------------------------------------------------------
const API_BASE = 'https://api.sudomock.com/api/v1';
const PUBLIC_2D_BASE = `${API_BASE}/sudoai/2d-mockups`;

const BACKEND_CONTRACT = {
	create2DMockup: { method: 'POST', url: () => PUBLIC_2D_BASE },
	list2DMockups: { method: 'GET', url: () => PUBLIC_2D_BASE },
	get2DMockup: { method: 'GET', url: (id) => `${PUBLIC_2D_BASE}/${id}` },
	delete2DMockup: { method: 'DELETE', url: (id) => `${PUBLIC_2D_BASE}/${id}` },
	set2DPrintAreas: {
		method: 'PUT',
		url: (id) => `${PUBLIC_2D_BASE}/${id}/print-areas`,
	},
	// The mockup id travels in the PATH. The body carries print_areas and
	// export_options only; mockup_uuid in the body is not part of the contract.
	render2DMockup: {
		method: 'POST',
		url: (id) => `${PUBLIC_2D_BASE}/${id}/render`,
	},
};

// Path fragments that must never appear in a URL the node builds.
const RETIRED_OR_INTERNAL_FRAGMENTS = [
	'/api/v1/sudoai/2d-mockup/', // retired singular path -> 404
	'/api/v1/sudoai/2d-mockup?', // retired singular collection -> 404
	"/api/v1/sudoai/2d-mockup'", // retired singular collection literal -> 404
	'/api/v1/sudoai/2d-mockup`', // retired singular collection literal -> 404
	'/api/v1/internal/', // internal router, not reachable with a customer key
	'/auto-segment',
	'/presign-masks',
	'/mask/commit',
];

const RENDER_BODY_FORBIDDEN_KEYS = ['mockup_uuid', 'mockupUuid', 'uuid'];

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
	'deleteArtworks',
	'deleteFont',
	'getFont',
	'listFonts',
	'removeBackground',
	'uploadFont',
];

// Operations retired from the node. They must not reappear in the dropdown.
const retiredOperations = ['storeArtworks'];

const twoDOperations = Object.keys(BACKEND_CONTRACT);

test('2D operations are well formed without removing existing operations', () => {
	const properties = new SudoMock().description.properties;
	const operation = properties.find((property) => property.name === 'operation');
	const values = operation.options.map((option) => option.value);

	assert.equal(new Set(values).size, values.length);
	for (const value of [...existingOperations, ...twoDOperations]) {
		assert.ok(values.includes(value), `missing operation ${value}`);
	}
	for (const value of retiredOperations) {
		assert.ok(!values.includes(value), `retired operation ${value} is still exposed`);
	}

	const propertyNames = properties.map((property) => property.name);
	assert.equal(new Set(propertyNames).size, propertyNames.length);
	for (const property of properties.filter((item) => item.name.startsWith('twoD'))) {
		assert.ok(
			property.displayOptions?.show?.operation,
			`${property.name} has no operation display option`,
		);
	}
});

test('2D public UI exposes exact render identifiers and allows backend-authoritative clearing', () => {
	const properties = new SudoMock().description.properties;
	const renderTargets = properties.find((property) => property.name === 'twoDRenderPrintAreas');
	const renderFields = renderTargets.options.find((option) => option.name === 'items').values;
	const targetType = renderFields.find((field) => field.name === 'targetType');
	const savedUuid = renderFields.find((field) => field.name === 'uuid');
	const surfaceUuid = renderFields.find((field) => field.name === 'surfaceUuid');
	const adjustments = renderFields.find((field) => field.name === 'adjustments');
	const setPrintAreas = properties.find((property) => property.name === 'twoDSetPrintAreas');

	// Only 'surface' is offered. 'fullSurface' is not in the picker any more but
	// is still shown, because a workflow saved before the rename holds that
	// value and its fields have to keep appearing.
	assert.deepEqual(
		targetType.options.map((option) => option.value),
		['savedPrintArea', 'surface'],
	);
	assert.deepEqual(savedUuid.displayOptions.show.targetType, ['savedPrintArea']);
	assert.deepEqual(surfaceUuid.displayOptions.show.targetType, ['surface', 'fullSurface']);
	assert.deepEqual(
		adjustments.options.map((option) => option.name),
		['blend_mode', 'blur', 'brightness', 'contrast', 'opacity', 'saturation', 'vibrance'],
	);
	assert.match(renderTargets.description, /exactly one/i);
	assert.match(setPrintAreas.description, /empty list/i);
	for (const name of ['twoDListLimit', 'twoDListOffset', 'twoDListCustomizableOnly']) {
		assert.deepEqual(
			properties.find((property) => property.name === name).displayOptions.show.operation,
			['list2DMockups'],
		);
	}
});

// A surface is a printable product, and a print area is a bounded zone somebody
// drew on one. They are separate render targets with separate dials: a surface
// takes coverage and no fit, a print area takes fit or an explicit box and no
// coverage. Each dial is bound to its own target kind so the node cannot offer
// the caller a combination the API answers with a 422.
test('each render target kind exposes only the placement dials that belong to it', () => {
	const properties = new SudoMock().description.properties;
	const renderFields = properties
		.find((property) => property.name === 'twoDRenderPrintAreas')
		.options.find((option) => option.name === 'items').values;
	const printAreaPlacement = renderFields.find((field) => field.name === 'placement');
	const surfacePlacement = renderFields.find((field) => field.name === 'surfacePlacement');

	assert.deepEqual(printAreaPlacement.displayOptions.show.targetType, ['savedPrintArea']);
	assert.deepEqual(surfacePlacement.displayOptions.show.targetType, ['surface', 'fullSurface']);

	assert.deepEqual(
		printAreaPlacement.options.map((option) => option.name),
		['fit', 'height', 'offset_x', 'offset_y', 'position', 'rotation', 'width'],
	);
	// A surface takes a percentage or an explicit box. The box is here because a
	// size drawn on a canvas cannot be written as a percentage once its
	// proportions differ from the surface it sits on.
	assert.deepEqual(
		surfacePlacement.options.map((option) => option.name),
		['coverage', 'height', 'offset_x', 'offset_y', 'position', 'rotation', 'width'],
	);
	// No fit on a surface, in either direction.
	assert.equal(
		surfacePlacement.options.find((option) => option.name === 'fit'),
		undefined,
	);
	assert.equal(
		printAreaPlacement.options.find((option) => option.name === 'coverage'),
		undefined,
	);

	// Defaults are what a caller gets the moment they add a dial, so they must
	// match what leaving the dial out already means. Omitting coverage covers
	// the whole surface, and omitting fit is the same as contain.
	assert.equal(
		surfacePlacement.options.find((option) => option.name === 'coverage').default,
		100,
	);
	assert.equal(printAreaPlacement.options.find((option) => option.name === 'fit').default, 'contain');
});

const MOCKUP_ID = 'mockup-1';

// Each case declares only the inputs and the request payload. Method and URL
// come from BACKEND_CONTRACT above, so a node that starts calling a different
// path fails here.
const cases = [
	{
		operation: 'create2DMockup',
		parameters: {
			twoDSourceMode: 'url',
			twoDSourceUrl: 'https://cdn.example.com/product.png',
			twoDName: 'T-Shirt Front',
			twoDCreateIsAsync: true,
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
			body: {
				source_url: 'https://cdn.example.com/product.png',
				name: 'T-Shirt Front',
				is_async: true,
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
		name: 'create2DMockup with Base64',
		operation: 'create2DMockup',
		parameters: {
			twoDSourceMode: 'base64',
			twoDSourceBase64: 'aW1hZ2U=',
			twoDName: '',
		},
		expected: {
			body: { source_base64: 'aW1hZ2U=' },
			json: true,
		},
	},
	{
		operation: 'get2DMockup',
		parameters: { twoDMockupUuid: MOCKUP_ID },
		pathId: MOCKUP_ID,
		// surfaces[] holds one entry per printable product and quads[] holds only
		// genuinely drawn print areas. The retired surfaces[].coverage is left in
		// this fake upstream on purpose: the node reads no field of it, so a stale
		// payload must still pass through to the workflow untouched.
		response: {
			data: {
				quads: [{ print_area_id: 'print-area-1' }],
				surfaces: [{ surface_uuid: 'surface-1', coverage: 'full' }],
			},
		},
		expected: { json: true },
	},
	{
		operation: 'list2DMockups',
		parameters: {
			twoDListLimit: 50,
			twoDListOffset: 10,
			twoDListCustomizableOnly: true,
		},
		expected: {
			qs: { limit: 50, offset: 10, customizable_only: true },
			json: true,
		},
	},
	{
		operation: 'set2DPrintAreas',
		parameters: {
			twoDMockupUuid: MOCKUP_ID,
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
		pathId: MOCKUP_ID,
		expected: {
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
		name: 'set2DPrintAreas with no saved areas',
		operation: 'set2DPrintAreas',
		parameters: {
			twoDMockupUuid: MOCKUP_ID,
			'twoDSetPrintAreas.items': [],
		},
		pathId: MOCKUP_ID,
		expected: {
			body: { print_areas: [] },
			json: true,
		},
	},
	{
		operation: 'render2DMockup',
		parameters: {
			twoDMockupUuid: MOCKUP_ID,
			twoDRenderIsAsync: true,
			'twoDRenderPrintAreas.items': [
				{
					targetType: 'savedPrintArea',
					uuid: 'print-area-1',
					artworkSource: 'base64',
					base64: 'aW1hZ2U=',
					color: '#FF0000',
					adjustments: {
						brightness: 5,
						blend_mode: 'multiply',
						warp_strength: 2,
						edge_softness: 10,
						edge_expand: 10,
						texture_strength: 100,
					},
					placement: { position: 'center', fit: 'cover' },
					surfacePlacement: { coverage: 55 },
				},
			],
			twoDExportOptions: {
				image_format: 'png',
				image_size: 2048,
				quality: 90,
				dpi: 300,
			},
		},
		pathId: MOCKUP_ID,
		expected: {
			body: {
				is_async: true,
				print_areas: [
					{
						uuid: 'print-area-1',
						base64: 'aW1hZ2U=',
						color: '#FF0000',
						adjustments: { brightness: 5, blend_mode: 'multiply' },
						placement: { position: 'center', fit: 'cover' },
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
			twoDMockupUuid: MOCKUP_ID,
			'twoDRenderPrintAreas.items': [
				{
					targetType: 'savedPrintArea',
					uuid: 'print-area-1',
					surfaceUuid: 'stale-surface',
					artworkSource: 'url',
					artworkUrl: 'https://cdn.example.com/design.png',
				},
			],
			twoDExportOptions: {},
		},
		pathId: MOCKUP_ID,
		expected: {
			body: {
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
		name: 'render2DMockup on a surface',
		operation: 'render2DMockup',
		parameters: {
			twoDMockupUuid: MOCKUP_ID,
			'twoDRenderPrintAreas.items': [
				{
					targetType: 'fullSurface',
					uuid: 'stale-saved-area',
					surfaceUuid: 'surface-1',
					artworkSource: 'url',
					artworkUrl: 'https://cdn.example.com/design.png',
				},
			],
			twoDExportOptions: {},
		},
		pathId: MOCKUP_ID,
		// Nothing the caller did not name travels: no placement was set, so the
		// body carries none and the API decides what the whole surface means.
		expected: {
			body: {
				print_areas: [
					{
						surface_uuid: 'surface-1',
						artwork_url: 'https://cdn.example.com/design.png',
					},
				],
			},
			json: true,
		},
	},
	{
		name: 'render2DMockup on a surface with coverage',
		operation: 'render2DMockup',
		parameters: {
			twoDMockupUuid: MOCKUP_ID,
			'twoDRenderPrintAreas.items': [
				{
					targetType: 'fullSurface',
					surfaceUuid: 'surface-1',
					artworkSource: 'url',
					artworkUrl: 'https://cdn.example.com/design.png',
					surfacePlacement: { position: 'center', coverage: 60 },
					// Left over from a target that used to be a print area. It
					// belongs to the other kind, so it must not reach the API.
					placement: { fit: 'cover', width: 800, height: 800 },
				},
			],
			twoDExportOptions: {},
		},
		pathId: MOCKUP_ID,
		expected: {
			body: {
				print_areas: [
					{
						surface_uuid: 'surface-1',
						artwork_url: 'https://cdn.example.com/design.png',
						placement: { position: 'center', coverage: 60 },
					},
				],
			},
			json: true,
		},
	},
	{
		operation: 'delete2DMockup',
		parameters: { twoDMockupUuid: MOCKUP_ID },
		pathId: MOCKUP_ID,
		expected: {},
	},
];

function runOperation(testCase) {
	const calls = [];
	const response = testCase.response ?? { operation: testCase.operation };
	const context = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _index, fallback) => {
			if (name === 'operation') return testCase.operation;
			return Object.prototype.hasOwnProperty.call(testCase.parameters, name)
				? testCase.parameters[name]
				: fallback;
		},
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({ credential, options });
				return response;
			},
		},
		continueOnFail: () => false,
		getNode: () => ({}),
	};

	return new SudoMock().execute.call(context).then((output) => ({ calls, output, response }));
}

function renderTarget(area) {
	return {
		operation: 'render2DMockup',
		parameters: {
			twoDMockupUuid: MOCKUP_ID,
			'twoDRenderPrintAreas.items': [area],
			twoDExportOptions: {},
		},
	};
}

test('a workflow saved before the rename still reaches its surface', async () => {
	// The picker only offers 'surface' now, but the value is what was written to
	// disk. Anything that stops recognising 'fullSurface' does not fail loudly:
	// it falls through to the print-area branch and renders the wrong target
	// while reporting success, which is why this is pinned.
	const { calls } = await runOperation(renderTarget({
		targetType: 'fullSurface',
		surfaceUuid: 'surface-legacy',
		artworkSource: 'url',
		artworkUrl: 'https://cdn.example.com/art.png',
		surfacePlacement: { coverage: 55 },
	}));
	const target = calls[0].options.body.print_areas[0];
	assert.equal(target.surface_uuid, 'surface-legacy');
	assert.equal('uuid' in target, false);
	assert.deepEqual(target.placement, { coverage: 55 });
});

test('a percentage saved on a print area is dropped rather than sent into a 422', async () => {
	// A workflow saved before 2026-08-19 holds coverage on a print area and has
	// no control left to remove it through. Forwarding it earns an immediate
	// 422 the author cannot trace back to a field they can no longer see.
	const { calls } = await runOperation(renderTarget({
		targetType: 'savedPrintArea',
		uuid: 'print-area-1',
		artworkSource: 'url',
		artworkUrl: 'https://cdn.example.com/art.png',
		placement: { coverage: 70, position: 'center' },
	}));
	assert.deepEqual(calls[0].options.body.print_areas[0].placement, { position: 'center' });

	// And when the percentage was the only thing there, no placement travels at
	// all rather than an empty object.
	const bare = await runOperation(renderTarget({
		targetType: 'savedPrintArea',
		uuid: 'print-area-1',
		artworkSource: 'url',
		artworkUrl: 'https://cdn.example.com/art.png',
		placement: { coverage: 70 },
	}));
	assert.equal('placement' in bare.calls[0].options.body.print_areas[0], false);
});

test('a surface takes a drawn box, but never alongside a percentage', async () => {
	const { calls } = await runOperation(renderTarget({
		targetType: 'surface',
		surfaceUuid: 'surface-1',
		artworkSource: 'url',
		artworkUrl: 'https://cdn.example.com/art.png',
		surfacePlacement: { width: 4459, height: 4500 },
	}));
	assert.deepEqual(calls[0].options.body.print_areas[0].placement, {
		width: 4459,
		height: 4500,
	});

	await assert.rejects(
		runOperation(renderTarget({
			targetType: 'surface',
			surfaceUuid: 'surface-1',
			artworkSource: 'url',
			artworkUrl: 'https://cdn.example.com/art.png',
			surfacePlacement: { coverage: 80, width: 4459, height: 4500 },
		})),
		/either Coverage or an explicit Width and Height/,
	);

	// Half a pair is refused on a surface too, not only on a print area.
	await assert.rejects(
		runOperation(renderTarget({
			targetType: 'surface',
			surfaceUuid: 'surface-1',
			artworkSource: 'url',
			artworkUrl: 'https://cdn.example.com/art.png',
			surfacePlacement: { width: 4459 },
		})),
		/Width and Height travel together/,
	);
});

test('2D operations call the documented backend paths', async (t) => {
	for (const testCase of cases) {
		await t.test(testCase.name ?? testCase.operation, async () => {
			const contract = BACKEND_CONTRACT[testCase.operation];
			assert.ok(contract, `no backend contract declared for ${testCase.operation}`);

			const { calls, output, response } = await runOperation(testCase);

			assert.deepEqual(calls, [
				{
					credential: 'sudoMockApi',
					options: {
						method: contract.method,
						url: contract.url(testCase.pathId),
						...testCase.expected,
					},
				},
			]);

			if (testCase.operation !== 'delete2DMockup') {
				assert.strictEqual(output[0][0].json, response);
			} else {
				assert.deepEqual(output[0][0].json, {
					success: true,
					message: '2D mockup deleted successfully',
					mockupUuid: MOCKUP_ID,
					statusCode: 204,
				});
			}
		});
	}
});

test('every 2D operation targets the plural collection, never a retired path', async (t) => {
	for (const testCase of cases) {
		await t.test(testCase.name ?? testCase.operation, async () => {
			const { calls } = await runOperation(testCase);
			const url = calls[0].options.url;

			assert.ok(
				url.startsWith(`${PUBLIC_2D_BASE}/`) || url === PUBLIC_2D_BASE,
				`${testCase.operation} must call ${PUBLIC_2D_BASE}, got ${url}`,
			);
			for (const fragment of RETIRED_OR_INTERNAL_FRAGMENTS) {
				assert.ok(
					!url.includes(fragment),
					`${testCase.operation} calls retired or internal path fragment ${fragment}: ${url}`,
				);
			}
			if (testCase.pathId) {
				assert.ok(
					url.includes(`/${testCase.pathId}`),
					`${testCase.operation} must carry the mockup id in the path: ${url}`,
				);
			}
		});
	}
});

test('render sends the mockup id in the path only, never in the body', async () => {
	const renderCases = cases.filter((testCase) => testCase.operation === 'render2DMockup');
	assert.ok(renderCases.length > 0);

	for (const testCase of renderCases) {
		const { calls } = await runOperation(testCase);
		const { url, body } = calls[0].options;

		assert.equal(url, `${PUBLIC_2D_BASE}/${MOCKUP_ID}/render`);
		for (const key of RENDER_BODY_FORBIDDEN_KEYS) {
			assert.ok(
				!Object.prototype.hasOwnProperty.call(body, key),
				`render body must not carry ${key}; the id belongs in the path`,
			);
		}
		assert.deepEqual(
			Object.keys(body).sort(),
			Object.keys(testCase.expected.body).sort(),
			'render body may carry only documented render fields',
		);
	}
});

test('a print area takes fit or an explicit box, never both and never half a pair', async (t) => {
	const rejected = [
		{
			name: 'fit alongside an explicit box',
			placement: { fit: 'cover', width: 800, height: 800 },
			message: /either Fit or an explicit Width and Height pair/i,
		},
		{
			name: 'width without height',
			placement: { position: 'center', width: 800 },
			message: /Width and Height travel together/i,
		},
		{
			name: 'height without width',
			placement: { position: 'center', height: 800 },
			message: /Width and Height travel together/i,
		},
	];

	for (const item of rejected) {
		await t.test(item.name, async () => {
			await assert.rejects(
				runOperation({
					operation: 'render2DMockup',
					parameters: {
						twoDMockupUuid: MOCKUP_ID,
						'twoDRenderPrintAreas.items': [
							{
								targetType: 'savedPrintArea',
								uuid: 'print-area-1',
								artworkSource: 'url',
								artworkUrl: 'https://cdn.example.com/design.png',
								placement: item.placement,
							},
						],
					},
				}),
				item.message,
			);
		});
	}
});

// A key written into the placement is the caller naming that option, whatever
// the write holds. The shared wire says so in
// `explicit_null_coverage_on_a_print_area`: the API answers a named option by
// name, so the node reads which keys were WRITTEN and not which ones hold a
// value. Two writes carry no value. Null is what a saved workflow holds once a
// value was cleared. Undefined is what an expression that resolved to nothing
// hands over, and it is the one a value check reads as absent, so every
// scenario below is run with both.
test('an option written into the placement names it, whatever the write holds', async (t) => {
	const artwork = { artworkSource: 'url', artworkUrl: 'https://cdn.example.com/design.png' };
	const printArea = { targetType: 'savedPrintArea', uuid: 'print-area-1', ...artwork };
	const surface = { targetType: 'surface', surfaceUuid: 'surface-1', ...artwork };
	const writes = [
		{ label: 'cleared', value: null },
		{ label: 'left empty by an expression', value: undefined },
	];
	const scenarios = [
		{
			name: 'Scale is still the retired control',
			area: (value) => ({ ...printArea, placement: { scale: value } }),
			message: /Scale was retired/i,
		},
		{
			name: 'Fit is still a second answer to the sizing question',
			area: (value) => ({ ...printArea, placement: { fit: value, width: 800, height: 800 } }),
			message: /either Fit or an explicit Width and Height pair/i,
		},
		{
			name: 'Width is still half a pair',
			area: (value) => ({ ...printArea, placement: { position: 'center', width: value } }),
			message: /Width and Height travel together/i,
		},
		{
			name: 'Fit on a surface is still Fit on a surface',
			area: (value) => ({ ...surface, surfacePlacement: { fit: value } }),
			message: /no bounds to fit against/i,
		},
		{
			name: 'Coverage is still a second answer to the sizing question',
			area: (value) => ({
				...surface,
				surfacePlacement: { coverage: value, width: 800, height: 800 },
			}),
			message: /either Coverage or an explicit Width and Height pair/i,
		},
	];

	for (const scenario of scenarios) {
		for (const write of writes) {
			await t.test(`${scenario.name} when ${write.label}`, async () => {
				const area = scenario.area(write.value);
				await assert.rejects(runOperation(renderTarget(area)), scenario.message);
			});
		}
	}
});

test('recent API resources, job kinds, and webhook events are exposed', () => {
	const properties = new SudoMock().description.properties;
	const events = [
		'render.succeeded',
		'render.failed',
		'upload.succeeded',
		'video.succeeded',
		'video.failed',
		'2d_mockup.ready',
		'2d_mockup.rejected',
		'2d_mockup.failed',
		'2d_render.succeeded',
		'2d_render.failed',
		'webhook.test',
	];

	assert.deepEqual(
		properties
			.find((property) => property.name === 'webhookEvents')
			.options.map((option) => option.value),
		events,
	);
	for (const name of ['webhookDeliveriesFilters', 'webhookEventsFilters']) {
		assert.deepEqual(
			properties
				.find((property) => property.name === name)
				.options.find((option) => option.name === 'eventType')
				.options.map((option) => option.value),
			events,
		);
	}

	const kind = properties
		.find((property) => property.name === 'listJobsFilters')
		.options.find((option) => option.name === 'kind');
	assert.deepEqual(
		kind.options.map((option) => option.value),
		['2d_create', '2d_render', 'render', 'upload', 'video'],
	);
});

test('text layers, fonts, artwork deletion, and background removal use the shipped API contract', async (t) => {
	const resourceCases = [
		{
			operation: 'render',
			parameters: {
				mockupUuid: 'mockup-1',
				'smartObjects.items': [],
				textLayers: JSON.stringify([{ uuid: 'layer-1', text: 'Custom name', fit: 'overflow' }]),
				exportOptions: {},
			},
			expected: {
				method: 'POST',
				url: `${API_BASE}/renders`,
				body: {
					mockup_uuid: 'mockup-1',
					smart_objects: [],
					text_layers: [{ uuid: 'layer-1', text: 'Custom name', fit: 'overflow' }],
				},
				json: true,
			},
		},
		{
			operation: 'listFonts',
			parameters: {
				fontFilters: {
					page: 2,
					perPage: 25,
					category: 'serif',
					search: 'Brand',
					scope: 'custom',
				},
			},
			expected: {
				method: 'GET',
				url: `${API_BASE}/fonts`,
				qs: {
					page: 2,
					per_page: 25,
					category: 'serif',
					search: 'Brand',
					scope: 'custom',
				},
				json: true,
			},
		},
		{
			operation: 'getFont',
			parameters: { fontUuid: 'font-1' },
			expected: { method: 'GET', url: `${API_BASE}/fonts/font-1`, json: true },
		},
		{
			operation: 'uploadFont',
			parameters: {
				fontUrl: 'https://cdn.example.com/Brand.ttf',
				fontLicenseConfirmed: true,
			},
			expected: {
				method: 'POST',
				url: `${API_BASE}/fonts`,
				body: {
					url: 'https://cdn.example.com/Brand.ttf',
					license_confirmed: true,
				},
				json: true,
			},
		},
		{
			operation: 'deleteFont',
			parameters: { fontUuid: 'font-1' },
			expected: {
				method: 'DELETE',
				url: `${API_BASE}/fonts/font-1`,
				json: true,
			},
		},
		{
			operation: 'removeBackground',
			parameters: {
				removeBackgroundImageUrl: 'https://cdn.example.com/product-photo.jpg',
			},
			expected: {
				method: 'POST',
				url: `${API_BASE}/remove-background`,
				body: { url: 'https://cdn.example.com/product-photo.jpg' },
				json: true,
			},
		},
		{
			operation: 'deleteArtworks',
			parameters: {
				artworkDeleteMode: 'urls',
				artworkDeleteUrls: '["https://cdn.example.com/artwork.png"]',
			},
			expected: {
				method: 'POST',
				url: `${API_BASE}/artworks/delete`,
				body: { urls: ['https://cdn.example.com/artwork.png'] },
				json: true,
			},
		},
	];

	for (const testCase of resourceCases) {
		await t.test(testCase.operation, async () => {
			const { calls } = await runOperation(testCase);
			assert.deepEqual(calls[0], {
				credential: 'sudoMockApi',
				options: testCase.expected,
			});
		});
	}
});

// The flag is a paid surcharge, so it must reach the API only when the user
// asked for it, and it must never be sent as an explicit false.
test('background removal flags travel on both render paths only when enabled', async (t) => {
	const psdArtwork = {
		url: 'https://cdn.example.com/design.png',
		fit: 'cover',
	};
	const psdParameters = (additionalOptions) => ({
		mockupUuid: 'mockup-1',
		'smartObjects.items': [
			{
				uuid: 'so-1',
				assetUrl: psdArtwork.url,
				fit: psdArtwork.fit,
				additionalOptions,
			},
		],
		textLayers: '[]',
		exportOptions: {},
	});

	await t.test('render forwards remove_background on the asset', async () => {
		const { calls } = await runOperation({
			operation: 'render',
			parameters: psdParameters({ removeBackground: true }),
		});

		assert.deepEqual(calls[0].options.body, {
			mockup_uuid: 'mockup-1',
			smart_objects: [{ uuid: 'so-1', asset: { ...psdArtwork, remove_background: true } }],
		});
	});

	await t.test('render omits remove_background when it is off', async () => {
		const { calls } = await runOperation({
			operation: 'render',
			parameters: psdParameters({ removeBackground: false }),
		});

		assert.deepEqual(calls[0].options.body.smart_objects, [{ uuid: 'so-1', asset: psdArtwork }]);
	});

	await t.test('render2DMockup forwards remove_background on the print area', async () => {
		const { calls } = await runOperation({
			operation: 'render2DMockup',
			parameters: {
				twoDMockupUuid: MOCKUP_ID,
				'twoDRenderPrintAreas.items': [
					{
						uuid: 'print-area-1',
						artworkSource: 'url',
						artworkUrl: psdArtwork.url,
						removeBackground: true,
					},
				],
				twoDExportOptions: {},
			},
		});

		assert.deepEqual(calls[0].options.body, {
			print_areas: [
				{
					uuid: 'print-area-1',
					artwork_url: psdArtwork.url,
					remove_background: true,
				},
			],
		});
	});
});

test('the trigger is packaged, verifies signatures, and cleans up an already deleted webhook', async () => {
	const packageJson = require('../package.json');
	const { SudoMockTrigger } = require('../dist/nodes/SudoMock/SudoMockTrigger.node.js');
	const { verifyWebhookSignature } = require('../dist/nodes/SudoMock/webhooks.js');
	const payload = '{"type":"2d_render.succeeded"}';
	const timestamp = 1_700_000_000;
	const signature = require('node:crypto')
		.createHmac('sha256', 'secret')
		.update(`${timestamp}.${payload}`)
		.digest('hex');

	assert.ok(packageJson.n8n.nodes.includes('dist/nodes/SudoMock/SudoMockTrigger.node.js'));
	assert.equal(
		verifyWebhookSignature(payload, signature, timestamp, 'secret', 300, timestamp),
		true,
	);
	assert.equal(
		verifyWebhookSignature(`${payload} `, signature, timestamp, 'secret', 300, timestamp),
		false,
	);
	assert.equal(
		verifyWebhookSignature(payload, signature, timestamp, 'secret', 300, timestamp + 301),
		false,
	);

	const staticData = { webhookId: 'already-deleted', webhookSecret: 'secret' };
	const deleted = await new SudoMockTrigger().webhookMethods.default.delete.call({
		getWorkflowStaticData: () => staticData,
		helpers: {
			httpRequestWithAuthentication: async () => Promise.reject({ statusCode: 404 }),
		},
	});
	assert.equal(deleted, true);
	assert.deepEqual(staticData, {});
});

test('the built node contains no retired or internal API paths', () => {
	const source = fs.readFileSync(NODE_DIST_PATH, 'utf8');

	for (const fragment of RETIRED_OR_INTERNAL_FRAGMENTS) {
		assert.ok(
			!source.includes(fragment),
			`built node still references retired or internal path fragment ${fragment}`,
		);
	}

	const sudoaiUrls = [
		...source.matchAll(/https:\/\/api\.sudomock\.com\/api\/v1\/sudoai[^'"`\s)]*/g),
	].map((match) => match[0]);
	assert.ok(sudoaiUrls.length > 0, 'expected the node to build 2D mockup URLs');

	const allowedShapes = new Set([
		PUBLIC_2D_BASE,
		`${PUBLIC_2D_BASE}/\${mockupUuid}`,
		`${PUBLIC_2D_BASE}/\${mockupUuid}/print-areas`,
		`${PUBLIC_2D_BASE}/\${mockupUuid}/render`,
	]);
	for (const url of sudoaiUrls) {
		assert.ok(allowedShapes.has(url), `unexpected 2D URL in the built node: ${url}`);
	}
});

test('the POD demo is runnable and follows the n8n template gates', () => {
	const workflow = JSON.parse(
		fs.readFileSync(path.join(__dirname, '..', 'demos', 'pod-product-creator-workflow.json')),
	);
	const byName = new Map(workflow.nodes.map((node) => [node.name, node]));

	assert.equal(byName.size, workflow.nodes.length, 'node names must be unique');
	assert.equal(new Set(workflow.nodes.map((node) => node.id)).size, workflow.nodes.length);
	assert.equal(workflow.meta, undefined, 'template exports must not retain an instance id');
	assert.equal(workflow.versionId, undefined, 'template exports must not retain a workflow id');
	assert.ok(!workflow.nodes.some((node) => node.credentials), 'credentials must not ship');

	const guide = byName.get('Workflow guide').parameters.content;
	assert.match(guide, /Self-hosted n8n only/);
	assert.match(guide, /Anyone with the link/);
	assert.match(guide, /Workflow Settings/);

	assert.deepEqual(
		workflow.connections['Workflow Settings'].main[0].map(({ node }) => node).sort(),
		['List SudoMock templates', 'List design files'],
	);
	assert.equal(byName.get('List SudoMock templates').parameters.returnAll, true);
	const driveSearch = byName.get('List design files').parameters;
	assert.equal(driveSearch.resource, 'fileFolder');
	assert.equal(driveSearch.operation, 'search');
	assert.equal(driveSearch.filter.whatToSearch, 'files');
	assert.equal(driveSearch.filter.folderId.value, '={{ $json.designFolderId }}');
	assert.equal(byName.get('Create design and template pairs').parameters.combineBy, 'combineAll');
	assert.equal(byName.get('Render product mockup').continueOnFail, true);
	assert.equal(byName.get('Convert results to CSV').parameters.operation, 'csv');

	const designCode = byName.get('Prepare public design URLs').parameters.jsCode;
	assert.match(designCode, /drive\.google\.com\/uc\?export=download&id=/);
	assert.ok(!designCode.includes('webViewLink'));
	assert.match(byName.get('Email batch summary').parameters.subject, /Prepare CSV rows/);

	for (const node of workflow.nodes.filter((candidate) => candidate.type === 'n8n-nodes-base.code')) {
		assert.doesNotThrow(() => new Function(node.parameters.jsCode), `${node.name} has invalid JS`);
	}
	for (const outputs of Object.values(workflow.connections)) {
		for (const output of outputs.main) {
			for (const edge of output) assert.ok(byName.has(edge.node), `missing target ${edge.node}`);
		}
	}
});
