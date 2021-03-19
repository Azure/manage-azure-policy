import * as azCli from '../src/azure/azCli';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as core from '@actions/core';

describe('Testing all functions in azCli file', () => {

	test('executeCommand() - execute a az command', async () => {
		jest.spyOn(io, 'which').mockResolvedValue('pathToAz');
		jest.spyOn(core, 'debug').mockImplementation();
		const execSpy = jest.spyOn(exec, 'exec').mockImplementation(async (command, args, options) => {
			options.listeners.stdout(Buffer.from('successResponse'));
			return 0;
		});

		expect(await azCli.AzCli.executeCommand('cloud show')).toBe('successResponse');
		expect(execSpy.mock.calls[0][0]).toBe('"pathToAz" cloud show');
	});

	test('executeCommand() - throw error if error occurs during command execution', async () => {
		jest.spyOn(io, 'which').mockResolvedValue('pathToAz');
		jest.spyOn(core, 'debug').mockImplementation();
		const execSpy = jest.spyOn(exec, 'exec').mockImplementation(async (command, args, options) => {
			options.listeners.stderr(Buffer.from('errorResponse'));
			throw '';
		});

		await expect(azCli.AzCli.executeCommand('cloud show')).rejects.toThrow('errorResponse');
		expect(io.which).toBeCalledWith('az', true);
		expect(execSpy.mock.calls[0][0]).toBe('"pathToAz" cloud show');
	});

	test('getManagementUrl() - get and return management endpoint URL', async () => {
		jest.spyOn(io, 'which').mockResolvedValue('pathToAz');
		const execSpy = jest.spyOn(exec, 'exec').mockImplementation(async (command, args, options) => {
			options.listeners.stdout(Buffer.from(JSON.stringify({
				"endpoints": {
					"resourceManager": "https://management.new.azure.com/",
				},
			})));
			return 0;
		});

		expect(await azCli.AzCli.getManagementUrl()).toBe('https://management.new.azure.com');
		expect(await azCli.AzCli.getManagementUrl()).toBe('https://management.new.azure.com');
		expect(execSpy.mock.calls.length).toBe(1);
	});

	test('getAccessToken() - get and return access token using management endpoint URL', async () => {
		jest.spyOn(io, 'which').mockResolvedValue('pathToAz');
		jest.spyOn(exec, 'exec').mockImplementation(async (command, args, options) => {
			options.listeners.stdout(Buffer.from(JSON.stringify({
				"accessToken": "token"
			})));
			return 0;
		});
		jest.spyOn(core, 'setSecret').mockImplementation();

		expect(await azCli.AzCli.getAccessToken()).toBe('token');
		expect(core.setSecret).toBeCalledWith({
			"accessToken": "token"
		});
	});

	test('getAccessToken() - throw error if something fails', async () => {
		jest.spyOn(io, 'which').mockResolvedValue('pathToAz');
		jest.spyOn(exec, 'exec').mockImplementation(async (command, args, options) => {
			options.listeners.stderr(Buffer.from('error'));
			throw '';
		});
		jest.spyOn(console, 'log').mockImplementation();

		await expect(azCli.AzCli.getAccessToken()).rejects.toThrow('error');
	});
});