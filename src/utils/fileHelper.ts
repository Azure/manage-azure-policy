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

export function getAllJsonFilesPath(dirs: string[]): string[] {
  let result: string[] = [];

  dirs.forEach((dir) => {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.resolve(dir, file);

      if (fs.statSync(filePath).isDirectory()) {
        const childrenFiles: string[] = getAllJsonFilesPath([filePath]);
        result.push(...childrenFiles);
      }
      else if (path.extname(filePath) == '.json') {
        result.push(filePath);
      }
    });
  });

  // Return unique file paths
  return [...new Set(result)];
}