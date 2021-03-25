import * as exec from '@actions/exec';
import * as core from '@actions/core';
import {
	AzHttpClient
} from '../src/azure/azHttpClient';
import {
	PolicyDetails,
	PolicyRequest
} from '../src/azure/policyHelper';
import {
	RoleRequest
} from '../src/azure/roleAssignmentHelper';
import * as httpClient from '../src/utils/httpClient';

describe('Testing all functions in azHttpClient file', () => {
	var testClient;
	beforeAll(async () => {
		jest.spyOn(exec, 'exec').mockImplementation(async (command, args, options) => {
			options.listeners.stdout(Buffer.from(JSON.stringify({
				"accessToken": "token"
			})));
			return 0;
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();

		testClient = new AzHttpClient();
		await testClient.initialize();
	});

	test('getAllAssignments() - return empty array if no ids provided', async () => {
		expect(await testClient.getAllAssignments([])).toMatchObject([]);
	});

	test('getAllAssignments() - return all assignments of the provided policydefinition id', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{}, {}, {}, {}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policyIds = [
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/34',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/56',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78',
		]

		expect(await testClient.getAllAssignments(policyIds)).toMatchObject([{}, {}, {}, {}]);
	});

	test('getAllAssignments() - reject if response status code is not ok', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 404,
			statusMessage: 'failed',
			headers: {},
			body: {
				message: 'Failed to reach server.'
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policyIds = [
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',
		]

		await expect(testClient.getAllAssignments(policyIds)).rejects.toBe(`An error occured while fetching the batch result. StatusCode: 404, Body: ${JSON.stringify({message: 'Failed to reach server.'})}`);
	});

	test('populateServicePolicies() - fetch policy from azure service and populate in the policy details', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policies = [{
			policyInCode: {
				id: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12'
			},
		}, {
			policyInCode: {
				id: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/34'
			},
		}, {
			policyInCode: {
				id: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/56'
			},
		}, {
			policyInCode: {
				id: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78'
			},
		}] as PolicyDetails[];

		expect(await testClient.populateServicePolicies(policies)).toBeUndefined();
		policies.forEach(policy => expect(policy.policyInService).toBe('policyDetails'));
	});

	test('populateServicePolicies() - throw error if response doesn\'t have same length', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policies = [{
			policyInCode: {
				id: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12'
			},
		}, {
			policyInCode: {
				id: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/34'
			},
		}] as PolicyDetails[];

		await expect(testClient.populateServicePolicies(policies)).rejects.toThrow('Azure batch response count does not match batch request count');
	});

	test('getAllAssignments() - return all assignments of the provided policydefinition id', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}, {
					content: 'policyDetails'
				}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policyIds = [
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/34',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/56',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78',
		]

		expect(await testClient.getPolicyDefintions(policyIds)).toMatchObject(['policyDetails', 'policyDetails', 'policyDetails', 'policyDetails']);
	});

	test('getAllAssignments() - throw error if response doesn\'t have same length', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{
					content: 'policyDetails'
				}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policyIds = [
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78',
		]

		await expect(testClient.getPolicyDefintions(policyIds)).rejects.toThrow('');
	});

	test('addRoleAssinments() - add role assignments', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{}, {}, {}, {}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const roleRequests = [{
			scope: 'subscriptions/12/resourcegroups/my-rg/',
			roleAssignmentId: 'providers/Microsoft.Authorization/roleAssignments/ab',
			principalId: 'abcd'
		}, {
			scope: 'subscriptions/12/resourcegroups/my-rg/',
			roleAssignmentId: 'providers/Microsoft.Authorization/roleAssignments/ab',
			principalId: 'efgh'
		}, {
			scope: 'subscriptions/12/resourcegroups/my-rg/',
			roleAssignmentId: 'providers/Microsoft.Authorization/roleAssignments/ab',
			principalId: 'hijk'
		}, {
			scope: 'subscriptions/12/resourcegroups/my-rg/',
			roleAssignmentId: 'providers/Microsoft.Authorization/roleAssignments/ab',
			principalId: 'lmno'
		}] as RoleRequest[];

		expect(await testClient.addRoleAssinments(roleRequests)).toMatchObject([{}, {}, {}, {}]);
	});

	test('upsertPolicyDefinitions() - insert or update policy definition', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{}, {}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policyIds = [{
			policy: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',

		}, {
			policy: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78',

		}] as PolicyRequest[];

		expect(await testClient.upsertPolicyDefinitions(policyIds)).toMatchObject([{}, {}]);
	});

	test('upsertPolicyDefinitions() - throw if response doesn\'t have same length', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{}, {}]
			}
		});
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const policyIds = [{
			policy: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',
		}] as PolicyRequest[];

		await expect(testClient.upsertPolicyDefinitions(policyIds)).rejects.toThrow('Azure batch response count does not match batch request count');
	});

	test('upsertPolicyInitiatives() - insert or update policy definition', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{}, {}]
			}
		});
		const policyIds = [{
			policy: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',

		}, {
			policy: 'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78',

		}] as PolicyRequest[];

		expect(await testClient.upsertPolicyDefinitions(policyIds)).toMatchObject([{}, {}]);
	});

	test('deletePolicies() - delete a policy using id', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{}, {}]
			}
		});
		const policyIds = [
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78',
		];

		expect(await testClient.deletePolicies(policyIds)).toMatchObject([{}, {}]);
	});

	test('deletePolicies() - throw if number of response objects is not equal to number of request objects', async () => {
		jest.spyOn(httpClient, 'sendRequest').mockResolvedValue({
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {
				responses: [{}, {}, {}, {}]
			}
		});
		const policyIds = [
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/12',
			'providers/Microsoft.Management/managementgroups/abcdef/providers/Microsoft.Authorization/policySetDefinitions/78',
		];

		await expect(testClient.deletePolicies(policyIds)).rejects.toThrow('Azure batch response count does not match batch request count');
	});
});