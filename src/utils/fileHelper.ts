import * as fs from 'fs';
import * as path from 'path';

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

export function getAllJsonFilesPath(dirs: string[]): string[] {
  let result: string[] = [];

  dirs.forEach((dir) => {
    let files = fs.readdirSync(dir);

    files.forEach((file) => {
      file = path.resolve(dir, file);

      if (fs.statSync(file).isDirectory()) {
        let additionalFiles: string[] = getAllJsonFilesPath([file]);
        result.push(...additionalFiles);
      }
      else if (path.extname(file) == '.json') {
        result.push(file);
      }
    });
  });

  // Return unique file paths
  return [...new Set(result)];
}