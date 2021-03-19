import * as inputs from '../src/inputProcessing/inputs';
import * as core from '@actions/core';

describe('Testing all functions in reportGenerator file', () => {
	test('getInputArray() - convert multiline input to array', () => {
		expect(inputs.getInputArray('a\n b\n c \nd')).toMatchObject(['a', 'b', 'c', 'd']);
	});

	test('validateAssignmentLikePatterns() - validates inputs on some rules and throws error if they fail', () => {
		expect(() => inputs.validateAssignmentLikePatterns('inputName', ['/'])).toThrow("Input 'inputName' should not contain directory separator '/' in any pattern.");
		expect(() => inputs.validateAssignmentLikePatterns('inputName', ['**'])).toThrow("Input 'inputName' should not contain globstar '**' in any pattern.");
		expect(inputs.validateAssignmentLikePatterns('inputName', ['a'])).toBeUndefined();
	});

	test('readInputs() - validates inputs and sets variables to access them', () => {
		jest.spyOn(core, 'getInput').mockImplementation((input) => {
			if (input == 'paths') return 'path1\npath2';
			if (input == 'ignore-paths') return 'path2/path21\npath2/path22';
			if (input == 'assignments') return 'assign.something.json';
			if (input == 'enforce') return 'enforce\n~doNotEnforce';
			if (input == 'mode') return 'complete';
			if (input == 'force-update') return 'false';
		});
		expect(inputs.readInputs()).toBeUndefined();
		expect(inputs.includePathPatterns).toMatchObject(['path1', 'path2']);
		expect(inputs.excludePathPatterns).toMatchObject(['path2/path21', 'path2/path22']);
		expect(inputs.assignmentPatterns).toMatchObject(['assign.something.json']);
		expect(inputs.enforcePatterns).toMatchObject(['enforce']);
		expect(inputs.doNotEnforcePatterns).toMatchObject(['doNotEnforce']);
		expect(inputs.mode).toBe('complete');
	});
});