import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SudoMockApi implements ICredentialType {
	name = 'sudoMockApi';
	displayName = 'SudoMock API';
	documentationUrl = 'https://sudomock.com/docs/authentication';
	
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your SudoMock API key (starts with sm_). Get it from your <a href="https://sudomock.com/dashboard/api-keys" target="_blank">Dashboard</a>.',
		},
	];

	// API key is automatically added to X-API-KEY header
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-KEY': '={{$credentials.apiKey}}',
			},
		},
	};

	// Credential test - make request to a simple endpoint
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.sudomock.com',
			url: '/api/v1/me',
			method: 'GET',
		},
	};
}
