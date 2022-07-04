import fs from 'fs';
import path from 'path';
import { Service } from 'typedi';
import { IFileSystemAdapter } from './IFileSystemAdapter';

@Service()
export class FSAdapter implements IFileSystemAdapter {
  fileExists(folder: string, fileName: string): boolean {
    return fs.existsSync(path.join(folder, fileName));
  }
  readFile(folder: string, fileName: string): string {
    return fs.readFileSync(path.join(folder, fileName), 'utf8');
  }
  listFiles(folder: string, extension: string): string[] {
    return fs.readdirSync(folder).filter((file) => file.endsWith(extension));
  }
}
