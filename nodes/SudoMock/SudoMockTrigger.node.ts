import {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
	NodeConnectionTypes,
	NodeApiError,
} from 'n8n-workflow';

import { verifyWebhookSignature, WEBHOOK_EVENT_OPTIONS } from './webhooks';

const API_URL = 'https://api.sudomock.com/api/v1/webhook-endpoints';

interface RawWebhookRequest {
	rawBody?: Buffer;
	readRawBody?: () => Promise<void>;
}

function firstHeader(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export class SudoMockTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SudoMock Trigger',
		name: 'sudoMockTrigger',
		icon: { light: 'file:sudomock.svg', dark: 'file:sudomock.svg' },
		group: ['trigger'],
		version: 1,
		subtitle:
			'={{$parameter["events"].length > 0 ? $parameter["events"].join(", ") : "All events"}}',
		description: 'Start a workflow when a SudoMock job or test event finishes',
		defaults: { name: 'SudoMock Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'sudoMockApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'sudomock',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: WEBHOOK_EVENT_OPTIONS,
				default: [],
				description:
					'Events that start this workflow. Leave empty to receive all events, including ones added in the future.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.webhookId || !data.webhookSecret) return false;

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
						method: 'GET',
						url: `${API_URL}/${data.webhookId as string}`,
						json: true,
					});
					return true;
				} catch (error) {
					if (Number((error as JsonObject).statusCode) !== 404) {
						throw new NodeApiError(this.getNode(), error as JsonObject);
					}
					delete data.webhookId;
					delete data.webhookSecret;
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				if (!url) return false;

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'sudoMockApi',
					{
						method: 'POST',
						url: API_URL,
						body: {
							url,
							description: 'Workflow trigger',
							event_types: this.getNodeParameter('events', []) as string[],
						},
						json: true,
					},
				)) as IDataObject;

				if (typeof response.id !== 'string' || typeof response.secret !== 'string') return false;
				const data = this.getWorkflowStaticData('node');
				data.webhookId = response.id;
				data.webhookSecret = response.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.webhookId) return true;

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'sudoMockApi', {
						method: 'DELETE',
						url: `${API_URL}/${data.webhookId as string}`,
					});
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				delete data.webhookId;
				delete data.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject() as RawWebhookRequest;
		if (!request.rawBody && request.readRawBody) await request.readRawBody();
		const rawBody = request.rawBody?.toString('utf8') ?? '';
		const headers = this.getHeaderData();
		const data = this.getWorkflowStaticData('node');
		const valid = verifyWebhookSignature(
			rawBody,
			firstHeader(headers['x-sudomock-signature']),
			firstHeader(headers['x-sudomock-timestamp']),
			typeof data.webhookSecret === 'string' ? data.webhookSecret : '',
		);

		if (!rawBody || !valid) {
			this.getResponseObject().status(401).json({ message: 'Invalid webhook signature' });
			return { noWebhookResponse: true };
		}

		return { workflowData: [[{ json: this.getBodyData() }]] };
	}
}
