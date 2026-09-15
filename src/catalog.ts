import data from '../data/viewhelpers.json';

export interface Argument {
  type: string;
  required: boolean;
  description: string;
  default?: string;
  values?: string[];
}
export interface ViewHelper {
  description: string;
  documentation: string;
  arguments: Record<string, Argument>;
}
export const catalog: Record<string, ViewHelper> = data.viewhelpers;
export const version = data.version;
