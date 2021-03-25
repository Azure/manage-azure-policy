import * as roleAssignmentHelper from '../src/azure/roleAssignmentHelper';
import {
	PolicyRequest
} from '../src/azure/policyHelper';
import * as core from '@actions/core';

jest.mock('uuid', () => {
	return {
		v4: () => 'newUUID'
	}
});

const mockGetPolicyFn = jest.fn().mockImplementation((policyIds) => [{
	error: {
		message: 'Some error message'
	}
}, {
	id: 'createPolicyId1',
	properties: {
		policyRule: {
			then: {
				details: {
					roleDefinitionIds: ['unwantedPart1/wantedPart1', 'unwantedPart2/wantedPart2']
				}
			}
		}
	}
}]);

const mockAddRoleAssignments = jest.fn().mockImplementation((roleRequests) => [{
	httpStatusCode: 201,
	content: {
		id: 'abc'
	}
}, {
	httpStatusCode: 404,
	content: {
		error: {
			message: 'Cant reach'
		}
	}
}]);

jest.mock('../src/azure/azHttpClient', () => {
	return {
		AzHttpClient: jest.fn().mockImplementation(() => {
			return {
				initialize: () => {},
				getPolicyDefintions: (policyIds) => mockGetPolicyFn(policyIds),
				addRoleAssinments: (roleRequests) => mockAddRoleAssignments(roleRequests)
			}
		})
	};
});

describe('Testing all function in roleAssignmentHelper file', () => {
	test('assignRoles() - assign roles using assignment requests, assignment responses and role assignment results', async () => {
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		const assignmentRequests = [{
			operation: 'CREATE',
			path: 'pathToCreateRequest1'
		}, {
			operation: 'CREATE',
			path: 'pathToCreateRequest2'
		}, {
			operation: 'UPDATE',
			path: 'pathToUpdateRequest'
		}] as PolicyRequest[];
		const assignmentResponses = [{
			content: {
				id: 'policyAssigmentId1',
				path: 'pathToPolicyAssignment1',
				identity: {
					principalId: 'principalId'
				},
				properties: {
					policyDefinitionId: 'createPolicyId1',
					scope: 'subscription'
				}
			}
		}, {
			content: {
				id: 'policyAssigmentId2',
				path: 'pathToPolicyAssignment2',
				identity: {
					principalId: 'principalId'
				},
				properties: {
					policyDefinitionId: 'createPolicyId2',
					scope: 'subscription'
				}
			}
		}, {
			content: {
				identity: {
					principalId: 'principalId'
				},
				properties: {
					policyDefinitionId: 'updatePolicyId'
				}
			}
		}];
		const roleAssignmentResults = [];
		expect(await roleAssignmentHelper.assignRoles(assignmentRequests, assignmentResponses, roleAssignmentResults));
		expect(mockGetPolicyFn).toBeCalledWith(['createPolicyId1', 'createPolicyId2']);
		expect(roleAssignmentResults).toMatchObject([{
				path: 'pathToCreateRequest1',
				type: 'Microsoft.Authorization/roleAssignments',
				operation: 'CREATE',
				displayName: 'Role Assignment for policy policy assignment id : policyAssigmentId1',
				status: 'FAILED',
				message: 'Some error message',
				policyDefinitionId: 'createPolicyId1'
			},
			{
				path: 'pathToCreateRequest1',
				type: 'Microsoft.Authorization/roleAssignments',
				operation: 'CREATE',
				displayName: 'Role Assignment for policy policy assignment id : policyAssigmentId1',
				status: 'SUCCEEDED',
				message: 'Role Assignment created with id : abc',
				policyDefinitionId: 'createPolicyId1'
			},
			{
				path: 'pathToCreateRequest1',
				type: 'Microsoft.Authorization/roleAssignments',
				operation: 'CREATE',
				displayName: 'Role Assignment for policy policy assignment id : policyAssigmentId1',
				status: 'FAILED',
				message: 'Cant reach',
				policyDefinitionId: 'createPolicyId1'
			}
		]);
		expect(mockAddRoleAssignments).toBeCalledWith([{
				scope: 'subscription',
				roleAssignmentId: 'newUUID',
				roleDefinitionId: 'wantedPart1',
				principalId: 'principalId',
				policyAssignmentId: 'policyAssigmentId1',
				policyDefinitionId: 'createPolicyId1',
				path: 'pathToCreateRequest1'
			},
			{
				scope: 'subscription',
				roleAssignmentId: 'newUUID',
				roleDefinitionId: 'wantedPart2',
				principalId: 'principalId',
				policyAssignmentId: 'policyAssigmentId1',
				policyDefinitionId: 'createPolicyId1',
				path: 'pathToCreateRequest1'
			}
		]);
	});
});