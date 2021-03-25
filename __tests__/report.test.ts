import * as reportGenerator from '../src/report/reportGenerator';

describe('Testing all functions in reportGenerator file', () => {
	test('getRowSeparator() - generate and return row seperator', () => {
		expect(reportGenerator.getRowSeparator([1, 2, 3, 4])).toMatchObject(['-', '--', '---', '----']);
	});

	test('getRowSeparator() - generate and return tableConfig', () => {
		const expected = {
			columns: {
				0: {
					width: 1,
					wrapWord: true
				},
				1: {
					width: 2,
					wrapWord: true
				},
				2: {
					width: 3,
					wrapWord: true
				},
				3: {
					width: 4,
					wrapWord: true
				}
			}
		}
		expect(reportGenerator.getTableConfig([1, 2, 3, 4])).toMatchObject(expected);
	});

	test('getTableConfig() - generate table config for table', () => {
		expect(reportGenerator.getTableConfig([1, 2, 3, 4])).toMatchObject({
			"columns": {
				"0": {
					"width": 1,
					"wrapWord": true
				},
				"1": {
					"width": 2,
					"wrapWord": true
				},
				"2": {
					"width": 3,
					"wrapWord": true
				},
				"3": {
					"width": 4,
					"wrapWord": true
				}
			}
		});
	});
});