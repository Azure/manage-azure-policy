import * as policyHelper from '../src/azure/policyHelper';
import {
	PolicyDetails
} from '../src/azure/policyHelper';
import * as pathHelper from '../src/inputProcessing/pathHelper';
import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';

const mockPopulateFn = jest.fn().mockImplementation((policies) => {
	policies.forEach(policy => {
		policy.policyInService = 'populated';
	});
});
jest.mock('../src/azure/azHttpClient', () => {
	return {
		AzHttpClient: jest.fn().mockImplementation(() => {
			return {
				initialize: () => {},
				populateServicePolicies: (policies) => mockPopulateFn(policies)
			}
		})
	};
});

describe('Testing all functions in policyHelper file', () => {
	test('getAllPolicyDetails() - get all policy details', async () => {
		jest.spyOn(pathHelper, 'getAllPolicyDefinitionPaths').mockReturnValue(['definitionPath']);
		jest.spyOn(pathHelper, 'getAllInitiativesPaths').mockReturnValue(['initiativePath']);
		jest.spyOn(pathHelper, 'getAllPolicyAssignmentPaths').mockReturnValue([path.join('definitionPath', 'assign.dev.json')]);
		const policyJson = JSON.stringify({
			"id": 'policyId',
			"name": 'policyName',
			"type": 'Microsoft.Authorization/policyDefinitions',
			"properties": {
				"displayName": "Allowed locations",
			}
		});
		const policyRulesJson = JSON.stringify({
			"if": {
				"not": {
					"field": "location",
					"in": "[parameters('allowedLocations')]"
				}
			}
		});
		const policyParametersJson = JSON.stringify({
			"allowedLocations": {
				"defaultValue": ["westus2"]
			}
		});
		const policysetJson = JSON.stringify({
			"properties": {
				"displayName": "Billing Tags Policy",
				"description": "Specify cost Center tag and product name tag",
				"metadata": {
					"version": "1.0.0",
					"category": "Tags"
				}
			}
		});
		const policySetDefinitionJson = JSON.stringify([{
			"policyDefinitionId": "/providers/Microsoft.Authorization/policyDefinitions/1e30110a-5ceb-460c-a204-c1c3969c6d62",
			"parameters": {
				"tagName": {
					"value": "costCenter"
				},
			}
		}]);
		const policySetParametersJson = JSON.stringify({
			"costCenterValue": {
				"type": "String",
				"metadata": {
					"description": "required value for Cost Center tag"
				},
				"defaultValue": "DefaultCostCenter"
			},
		});
		const policyAssignJson = JSON.stringify({
			"name": "assignName",
			"type": "Microsoft.Authorization/policyAssignments",
			"apiVersion": "2020-09-01",
			"scope": "subscription",
			"properties": {
				"displayName": "something",
			},
			"location": "westus",
			"identity": {
				"type": "new"
			}
		});
		jest.spyOn(pathHelper, 'isNonEnforced').mockReturnValue(false);
		jest.spyOn(pathHelper, 'isEnforced').mockReturnValue(true);
		jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(core, 'debug').mockImplementation();
		jest.spyOn(fs, 'readFileSync').mockImplementation((file) => {
			if (path.join('definitionPath', 'policy.json')) return policyJson;
			if (path.join('definitionPath', 'policy.rules.json')) return policyRulesJson;
			if (path.join('definitionPath', 'policy.parameters.json')) return policyParametersJson;
			if (path.join('initiativePath', 'policyset.json')) return policysetJson;
			if (path.join('initiativePath', 'policyset.definitions.json')) return policySetDefinitionJson;
			if (path.join('initiativePath', 'policyset.parameters.json')) return policySetParametersJson;
			if (path.join('definitionPath', 'assign.dev.json')) return policyAssignJson;
		});

		expect(await policyHelper.getAllPolicyDetails()).toMatchObject([{
				"path": "definitionPath",
				"policyInCode": {
					"id": "policyId",
					"name": "policyName",
					"type": "Microsoft.Authorization/policyDefinitions",
					"properties": {
						"displayName": "Allowed locations",
						"policyRule": {
							"id": "policyId",
							"name": "policyName",
							"type": "Microsoft.Authorization/policyDefinitions",
							"properties": {
								"displayName": "Allowed locations"
							}
						},
						"parameters": {
							"id": "policyId",
							"name": "policyName",
							"type": "Microsoft.Authorization/policyDefinitions",
							"properties": {
								"displayName": "Allowed locations"
							}
						}
					}
				},
				"policyInService": "populated"
			},
			{
				"path": "initiativePath",
				"policyInCode": {
					"id": "policyId",
					"name": "policyName",
					"type": "Microsoft.Authorization/policyDefinitions",
					"properties": {
						"displayName": "Allowed locations",
						"policyDefinitions": {
							"id": "policyId",
							"name": "policyName",
							"type": "Microsoft.Authorization/policyDefinitions",
							"properties": {
								"displayName": "Allowed locations"
							}
						},
						"parameters": {
							"id": "policyId",
							"name": "policyName",
							"type": "Microsoft.Authorization/policyDefinitions",
							"properties": {
								"displayName": "Allowed locations"
							}
						}
					}
				},
				"policyInService": "populated"
			},
			{
				"path": path.join('definitionPath', 'assign.dev.json'),
				"policyInCode": {
					"id": "policyId",
					"name": "policyName",
					"type": "Microsoft.Authorization/policyDefinitions",
					"properties": {
						"displayName": "Allowed locations",
						"enforcementMode": "Default"
					}
				},
				"policyInService": "populated"
			}
		]);
	});

	test('getPolicyOperationType() - return NONE if policy is not newly created', () => {
		const policyDetails = {
			policyInCode: {

			},
			policyInService: {
				properties: {
					metadata: {
						gitHubPolicy: {
							digest: 'abc'
						}
					}
				}
			}
		} as PolicyDetails;

		expect(policyHelper.getPolicyOperationType(policyDetails, 'abc')).toBe('NONE');
	});

	test('getPolicyOperationType() - return UPDATE if hash is not available in policy', () => {
		const policyDetails = {
			policyInCode: {

			},
			policyInService: {}
		} as PolicyDetails;

		expect(policyHelper.getPolicyOperationType(policyDetails, 'def')).toBe('UPDATE');
	});

	test('getPolicyOperationType() - return CREATE if policy needs to be created', () => {
		const policyDetails = {
			policyInCode: {

			},
			policyInService: {
				error: {}
			}
		} as PolicyDetails;

		expect(policyHelper.getPolicyOperationType(policyDetails, 'def')).toBe('CREATE');
	});

	test('getPolicyOperationType() - return UPDATE if policy needs to be updated', () => {
		const policyDetails = {
			policyInCode: {

			},
			policyInService: {
				properties: {
					metadata: {
						gitHubPolicy: {
							digest: 'abc'
						}
					}
				}
			}
		} as PolicyDetails;

		expect(policyHelper.getPolicyOperationType(policyDetails, 'def')).toBe('UPDATE');
	});

	test('getPolicyRequest() - create and return policy request using parameters', () => {
		const processEnv = process.env;
		process.env.GITHUB_REPOSITORY = 'githubRepo';
		process.env.GITHUB_SHA = 'sampleSha';
		process.env.GITHUB_RUN_ID = '552';
		const expected = {
			"policy": {
				"properties": {
					"metadata": {
						"gitHubPolicy": {
							"digest": "abc",
							"repoName": "githubRepo",
							"commitSha": "sampleSha",
							"runUrl": "https://github.com/githubRepo/actions/runs/552",
							"filepath": "pathToPolicy"
						}
					}
				}
			},
			"path": "pathToPolicy",
			"operation": "UPDATE"
		};

		expect(policyHelper.getPolicyRequest({}, 'pathToPolicy', 'abc', 'UPDATE')).toMatchObject(expected);
		process.env = processEnv;
	});
});