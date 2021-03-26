import * as pathHelper from '../src/inputProcessing/pathHelper';
import * as path from 'path';
import * as glob from 'glob';
import * as core from '@actions/core';

jest.mock('../src/inputProcessing/inputs', () => {
	return {
		includePathPatterns: ['policies1/**', 'policies2/**'],
		excludePathPatterns: ['policies2/ignorePolicies/**'],
		assignmentPatterns: ['assign.*.json']
	}
});

describe('Testing all functions in pathHelper file', () => {
	test('getAllPolicyDefinitionPaths() - get all directories in non excluding paths with policy.json', () => {
		jest.spyOn(glob, 'sync').mockImplementation((pattern) => {
			if (pattern == path.join('policies1', '**', 'policy.json')) return [
				path.join('policies1', 'somePolicies', 'policy.json'),
				path.join('policies1', 'policy.json'),
			];
			if (pattern == path.join('policies2', '**', 'policy.json')) return [
				path.join('policies2', 'ignorePolicies', 'policy.json'),
				path.join('policies2', 'somePolicies', 'policy.json')
			];
			if (pattern == path.join('policies2', 'ignorePolicies', '**', 'policy.json')) return [
				path.join('policies2', 'ignorePolicies', 'policy.json')
			];
		});
		jest.spyOn(core, 'debug').mockImplementation();

		expect(pathHelper.getAllPolicyDefinitionPaths()).toMatchObject([
			path.join('policies1', 'somePolicies'),
			path.join('policies1'),
			path.join('policies2', 'somePolicies')
		]);
	});

	test('getAllInitiativesPaths() - get all directories in non excluding paths with policyset.json', () => {
		jest.spyOn(glob, 'sync').mockImplementation((pattern) => {
			if (pattern == path.join('policies1', '**', 'policyset.json')) return [
				path.join('policies1', 'somePolicies', 'policyset.json'),
				path.join('policies1', 'policyset.json'),
			];
			if (pattern == path.join('policies2', '**', 'policyset.json')) return [
				path.join('policies2', 'ignorePolicies', 'policyset.json'),
				path.join('policies2', 'somePolicies', 'policyset.json')
			];
			if (pattern == path.join('policies2', 'ignorePolicies', '**', 'policyset.json')) return [
				path.join('policies2', 'ignorePolicies', 'policyset.json')
			];
		});
		jest.spyOn(core, 'debug').mockImplementation();

		expect(pathHelper.getAllInitiativesPaths()).toMatchObject([
			path.join('policies1', 'somePolicies'),
			path.join('policies1'),
			path.join('policies2', 'somePolicies')
		]);
	});

	test('getAllPolicyAssignmentPaths() - get all assignment files in input paths parameter with input pattern', () => {
		jest.spyOn(glob, 'sync').mockImplementation((pattern) => {
			if (pattern == path.join('policies1', '**', 'assign.*.json')) return [
				path.join('policies1', 'somePolicies', 'assign.one.json'),
				path.join('policies1', 'assign.two.json')
			];
			if (pattern == path.join('policies2', '**', 'assign.*.json')) return [
				path.join('policies2', 'ignorePolicies', 'assign.three.json'),
				path.join('policies2', 'somePolicies', 'assign.four.json')
			];
			if (pattern == path.join('policies2', 'ignorePolicies', '**', 'assign.*.json')) return [
				path.join('policies2', 'ignorePolicies', 'assign.three.json')
			];
		});
		jest.spyOn(core, 'debug').mockImplementation();

		expect(pathHelper.getAllPolicyAssignmentPaths()).toMatchObject([
			path.join('policies1', 'somePolicies', 'assign.one.json'),
			path.join('policies1', 'assign.two.json'),
			path.join('policies2', 'somePolicies', 'assign.four.json'),
		]);
	});

	test('getAllAssignmentInPaths() - get all assignment files in given paths parameter with input pattern', () => {
		jest.spyOn(glob, 'sync').mockImplementation((pattern) => {
			if (pattern == path.join('policies2', 'ignorePolicies', '**', 'assign.*.json')) return [
				path.join('policies2', 'ignorePolicies', 'assign.one.json')
			];
		});
		jest.spyOn(core, 'debug').mockImplementation();

		expect(pathHelper.getAllAssignmentInPaths(['policies2/ignorePolicies/**'])).toMatchObject([
			path.join('policies2', 'ignorePolicies', 'assign.one.json')
		]);
	});
});