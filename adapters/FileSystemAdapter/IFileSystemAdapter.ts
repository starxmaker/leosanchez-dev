export interface IFileSystemAdapter {
  readFile(folder: string, fileName: string): string;
  listFiles(folder: string, extension: string): string[];
  fileExists(folder: string, fileName: string): boolean;
}
