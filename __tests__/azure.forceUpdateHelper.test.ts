import * as forceUpdateHelper from '../src/azure/forceUpdateHelper';
import * as policyHelper from '../src/azure/policyHelper';
import {
	PolicyRequest
} from '../src/azure/policyHelper';
import * as pathHelper from '../src/inputProcessing/pathHelper';
import * as utilities from '../src/utils/utilities';
import * as path from 'path';
import * as core from '@actions/core';

const mockGetAllAssignments = jest.fn().mockImplementation((policyIds) => [{
	httpStatusCode: 200,
	content: {
		value: [{
			id: 'policyAssignment1',
			name: 'policyName1',
			properties: {
				displayName: 'test policy 1',
			}
		}]
	}
}, {
	httpStatusCode: 200,
	content: {
		value: [{
			id: 'policyAssignment4',
			name: 'policyName4',
			properties: {
				displayName: 'test policy 4',
			}
		}]
	}
}]);

const mockGetPolicyDefinitions = jest.fn().mockImplementation((policyIds) => [{
	id: 'policyDefinitionId1',
	name: 'pol def 1',
	type: 'CREATE',
	properties: {
		displayName: 'test policy definition 1',
		policyDefinitionId: 'policyDefinitionId1'
	}
}, {
	id: 'policyDefinitionId4',
	name: 'pol def 2',
	type: 'CREATE',
	properties: {
		displayName: 'test policy definition 4',
		policyDefinitionId: 'policyDefinitionId4'
	}
}]);

const mockUpsetPolicyDefinitions = jest.fn().mockImplementation((definitionRequests) => [{
	content: {
		id: 'fromUpsert',
		name: 'fromUpsert',
		type: 'UPDATE'
	}
}, {
	content: {
		id: 'fromUpsert',
		name: 'fromUpsert',
		type: 'UPDATE'
	}
}]);

const mockUpsertPolicyAssignments = jest.fn().mockImplementation((definitionRequests) => [{
	content: {
		id: 'fromUpsert Assignmet',
		name: 'fromUpsert Assignmet',
		type: 'UPDATE'
	}
}, {
	content: {
		id: 'fromUpsert Assignmet',
		name: 'fromUpsert Assignmet',
		type: 'UPDATE'
	}
}]);

const mockDeletePolicies = jest.fn().mockImplementation((policyIds) => [{
	httpStatusCode: 200
}, {
	httpStatusCode: 200
}]);

jest.mock('../src/azure/azHttpClient', () => {
	return {
		AzHttpClient: jest.fn().mockImplementation(() => {
			return {
				initialize: () => {},
				getAllAssignments: (policyDefinitionIds) => mockGetAllAssignments(policyDefinitionIds),
				getPolicyDefintions: (policyDefinitionIds) => mockGetPolicyDefinitions(policyDefinitionIds),
				upsertPolicyDefinitions: (definitionRequests) => mockUpsetPolicyDefinitions(definitionRequests),
				upsertPolicyAssignments: (assignmentRequests) => mockUpsertPolicyAssignments(assignmentRequests),
				deletePolicies: (policyIds) => mockDeletePolicies(policyIds)
			}
		})
	};
});

describe('Testing all functions in forceUpdateHelper file', () => {
	test('handleForceUpdate() - force update the policies', async () => {
		const definitionRequests = [{
			path: 'path1',
			operation: 'UPDATE',
			policy: {
				id: 'policyDefinition1',
				type: 'Microsoft.Authorization/policyDefinition',
				name: 'displayName1',
				properties: {
					policyDefinitionId: 'policyDefinitionId1'
				}
			}
		}, {
			path: 'path2',
			operation: 'UPDATE',
			policy: {
				id: 'policyDefinition2'
			}
		}, {
			path: 'path3',
			operation: 'CREATE',
			policy: {
				id: 'policyDefinition3'
			}
		}, {
			path: 'path4',
			operation: 'UPDATE',
			policy: {
				id: 'policyDefinition4',
				type: 'Microsoft.Authorization/policyDefinition',
				name: 'displayName1',
				properties: {
					policyDefinitionId: 'policyDefinitionId4'
				}
			}
		}] as PolicyRequest[];
		const policyResponses = [{
			httpStatusCode: 400,
		}, {
			httpStatusCode: 200,
		}, {
			httpStatusCode: 400,
		}, {
			httpStatusCode: 400,
		}];
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		jest.spyOn(utilities, 'getRandomShortString').mockReturnValueOnce('randomShortString');
		jest.spyOn(pathHelper, 'getAllAssignmentInPaths').mockReturnValue([path.join('path1', 'policyDefinition1'), path.join('path2', 'policyDefinition2')]);
		jest.spyOn(policyHelper, 'getPolicyAssignments').mockReturnValueOnce([{
			id: 'policyAssignment1',
		}]).mockReturnValueOnce([{
			id: 'policyAssignment4'
		}]);
		jest.spyOn(policyHelper, 'getPolicyAssignment').mockReturnValueOnce({
			id: 'policyAssignment1',
			type: 'Microsoft.Authorization/policyAssignments',
			name: 'assignmentDisplayName1'
		}).mockReturnValueOnce({
			id: 'policyAssignment4',
			type: 'Microsoft.Authorization/policyAssignments',
			name: 'assignmentDisplayName4'
		});
		const policyResults = []
		await forceUpdateHelper.handleForceUpdate(definitionRequests, policyResponses, [], policyResults);
		expect(policyResults).toMatchObject([{
				path: 'path1',
				type: 'Microsoft.Authorization/policyDefinition',
				operation: 'FORCE_UPDATE',
				displayName: 'displayName1',
				status: 'SUCCEEDED',
				message: 'Policy Microsoft.Authorization/policyDefinitions updated successfully',
				policyDefinitionId: 'policyDefinition1'
			},
			{
				path: 'path4',
				type: 'Microsoft.Authorization/policyDefinition',
				operation: 'FORCE_UPDATE',
				displayName: 'displayName1',
				status: 'SUCCEEDED',
				message: 'Policy Microsoft.Authorization/policyDefinitions updated successfully',
				policyDefinitionId: 'policyDefinition4'
			},
			{
				path: path.join('path1', 'policyDefinition1'),
				type: 'Microsoft.Authorization/policyAssignments',
				operation: 'FORCE_CREATE',
				displayName: 'assignmentDisplayName1',
				status: 'SUCCEEDED',
				message: 'Policy Microsoft.Authorization/policyAssignments created successfully',
				policyDefinitionId: undefined
			},
			{
				path: path.join('path2', 'policyDefinition2'),
				type: 'Microsoft.Authorization/policyAssignments',
				operation: 'FORCE_CREATE',
				displayName: 'assignmentDisplayName4',
				status: 'SUCCEEDED',
				message: 'Policy Microsoft.Authorization/policyAssignments created successfully',
				policyDefinitionId: undefined
			}
		]);
	});
});