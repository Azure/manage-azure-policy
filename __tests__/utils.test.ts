import * as fileHelper from '../src/utils/fileHelper';
import * as utilities from '../src/utils/utilities';
import * as fs from 'fs';
import * as client from '../src/utils/httpClient';
import {
	WebRequestOptions
} from '../src/utils/httpClient';
import * as core from '@actions/core';
import httpClient = require("typed-rest-client/HttpClient");
import * as crypto from "crypto";

describe('Testing functions in fileHelper.', () => {
	test('getFileJson() - reads a file, parses and returns json', () => {
		jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
		expect(fileHelper.getFileJson('pathToFile')).toMatchObject({});
	});

	test('getFileJson() - reads a file, parses and throw error if invalid json', () => {
		jest.spyOn(fs, 'readFileSync').mockReturnValue('');
		expect(() => fileHelper.getFileJson('pathToFile')).toThrow('An error occured while parsing the contents of the file: pathToFile. Error: SyntaxError: Unexpected end of JSON input');
	});
});

describe('Testing functions in utilities', () => {
	test('getWorkflowRunUrl() - form and return current workflow run url', () => {
		const processEnv = process.env;
		process.env.GITHUB_REPOSITORY = 'sampleRepo'
		process.env.GITHUB_RUN_ID = '55'
		expect(utilities.getWorkflowRunUrl()).toBe('https://github.com/sampleRepo/actions/runs/55');
		process.env = processEnv;
	});

	test('setUpUserAgent() - set user agent variable', () => {
		jest.spyOn(core, 'exportVariable').mockImplementation();
		const processEnv = process.env;
		process.env.GITHUB_REPOSITORY = 'sampleRepo';
		expect(utilities.setUpUserAgent()).toBeUndefined();
		expect(core.exportVariable).toBeCalledWith('AZURE_HTTP_USER_AGENT', `GITHUBACTIONS_ManageAzurePolicy_${crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex')}`);
		process.env = processEnv;
	});

	test('groupBy() - groups all elements of an array with same property', () => {
		const someProperty = 'property';
		const inputArray = [{
				id: 1,
				'property': 'a'
			},
			{
				id: 2,
				'property': 'b'
			},
			{
				id: 3,
				'property': 'c'
			},
			{
				id: 4,
				'property': 'a'
			},
			{
				id: 5,
				'property': 'a'
			},
			{
				id: 6,
				'property': 'b'
			},
			{
				id: 7,
				'property': 'c'
			},
		];

		const outputObject = {
			'a': [{
					id: 1,
					'property': 'a'
				},
				{
					id: 4,
					'property': 'a'
				},
				{
					id: 5,
					'property': 'a'
				}
			],
			'b': [{
					id: 2,
					'property': 'b'
				},
				{
					id: 6,
					'property': 'b'
				}
			],
			'c': [{
					id: 3,
					'property': 'c'
				},
				{
					id: 7,
					'property': 'c'
				}
			]
		}
		expect(utilities.groupBy(inputArray, someProperty)).toMatchObject(outputObject);
	});

	test('repeatString() - returns the input string repeated specified number of times', () => {
		expect(utilities.repeatString('abc', 5)).toBe('abcabcabcabcabc');
	});

	test('populatePropertyFromJsonFile() - populates property to the given object from the provided jsonfile', () => {
		jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		const jsonFile = JSON.stringify({
			property: 'someValue'
		});
		jest.spyOn(fs, 'readFileSync').mockReturnValue(jsonFile);
		const inputObject = {};

		expect(utilities.populatePropertyFromJsonFile(inputObject, 'jsonFilePath', 'property')).toBeUndefined();
		expect(inputObject).toMatchObject({
			property: 'someValue'
		});
	});

	test('populatePropertyFromJsonFile() - jsonfile does not contain the property whole json object is populated', () => {
		jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
		const inputObject = {};

		expect(utilities.populatePropertyFromJsonFile(inputObject, 'jsonFilePath', 'property')).toBeUndefined();
		expect(inputObject).toMatchObject({
			property: {}
		});
	});
});

var mockResponses: any[], mockRequestNumber: number;
const mockRequestFuncion = jest.fn().mockImplementation(async () => {
	if (mockRequestNumber < mockResponses.length) {
		if (mockResponses[mockRequestNumber].message && mockResponses[mockRequestNumber].message.statusCode)
			return Promise.resolve(mockResponses[mockRequestNumber++]);
		else
			return Promise.reject(mockResponses[mockRequestNumber++])
	};
});
jest.mock('typed-rest-client/HttpClient', () => {
	return {
		HttpClient: jest.fn().mockImplementation(() => {
			return {
				request: async (verb, requestUrl, data) => mockRequestFuncion(verb, requestUrl, data)
			}
		})
	}
});

describe('Testing all functions in httpClient file.', () => {
	test('toWebResponse() - construct WebResponse object from response and return', async () => {
		const sampleResponse = {
			message: {
				statusCode: 200,
				statusMessage: 'success',
				headers: {}
			},
			readBody: () => Promise.resolve('{}')
		} as httpClient.HttpClientResponse;
		const sampleReturn = {
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {}
		};

		expect(await client.toWebResponse(sampleResponse)).toEqual(sampleReturn);
	});

	test('toWebResponse() - return response body as is if not parseable', async () => {
		jest.spyOn(core, 'debug').mockImplementation();
		const sampleResponse = {
			message: {
				statusCode: 200,
				statusMessage: 'success',
				headers: {}
			},
			readBody: () => Promise.resolve('invalid')
		} as httpClient.HttpClientResponse;
		const sampleReturn = {
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: 'invalid'
		};

		expect(await client.toWebResponse(sampleResponse)).toEqual(sampleReturn);
	});

	test('sendRequestInternal() - make request and return response as WebResponse', async () => {
		const sampleResponse = {
			message: {
				statusCode: 200,
				statusMessage: 'success',
				headers: {}
			},
			readBody: () => Promise.resolve('{}')
		} as httpClient.HttpClientResponse;
		const sampleReturn = {
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {}
		};
		const sampleRequest = {
			method: 'get',
			uri: 'https://github.com',
			body: {}
		} as client.WebRequest;
		jest.spyOn(core, 'debug').mockImplementation();
		mockRequestNumber = 0
		mockResponses = [sampleResponse];

		expect(await client.sendRequestInternal(sampleRequest)).toEqual(sampleReturn);
		expect(mockRequestFuncion).toBeCalledWith('get', 'https://github.com', {});
	});

	test('sendRequest() - make requests with specified options and return WebResponse promise', async () => {
		const sampleOptions = {
			retryCount: 3,
			retryIntervalInSeconds: 0.1
		} as WebRequestOptions;
		const sampleResponse = {
			message: {
				statusCode: 200,
				statusMessage: 'success',
				headers: {}
			},
			readBody: () => Promise.resolve('{}')
		} as httpClient.HttpClientResponse;
		const sampleRetryResponse = {
			message: {
				statusCode: 408,
				statusMessage: 'timeout',
				headers: {}
			},
			readBody: () => Promise.resolve('{}')
		} as httpClient.HttpClientResponse;
		const sampleErrorResponse = {
			code: 'ECONNRESET'
		};
		const sampleReturn = {
			statusCode: 200,
			statusMessage: 'success',
			headers: {},
			body: {}
		};
		const sampleRequest = {
			method: 'get',
			uri: 'https://github.com',
		} as client.WebRequest;
		jest.spyOn(core, 'debug').mockImplementation();
		mockRequestNumber = 0
		mockResponses = [sampleRetryResponse, sampleErrorResponse, sampleResponse];

		jest.setTimeout(10000);
		const sendRequestPromise = client.sendRequest(sampleRequest, sampleOptions)
		await sendRequestPromise.then(response => {
			expect(response).toEqual(sampleReturn);
			expect(mockRequestFuncion).toBeCalledTimes(3);
			expect(mockRequestFuncion).toBeCalledWith('get', 'https://github.com', undefined);
		});
	});
});