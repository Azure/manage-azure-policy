import * as fs from 'fs';

export function doesFileExist(path: string): boolean {
  return fs.existsSync(path);
}

export function getFileJson(path: string): any {
  try {
    const rawContent = fs.readFileSync(path, 'utf-8');
    return JSON.parse(rawContent);
  } catch (ex) {
    throw new Error(`An error occured while parsing the contents of the file: ${path}. Error: ${ex}`);
  }
}