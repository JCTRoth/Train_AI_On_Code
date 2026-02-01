/**
 * Data models for the Context Extractor MCP Server
 */

export interface ParameterInfo {
  name: string;
  type: string;
  hasDefault?: boolean;
}

export interface MethodInfo {
  name: string;
  returnType: string;
  parameters: ParameterInfo[];
  isStatic?: boolean;
  isAsync?: boolean;
  docstring?: string;
}

export interface PropertyInfo {
  name: string;
  type: string;
  hasGetter?: boolean;
  hasSetter?: boolean;
}

export interface ObjectNode {
  name: string;
  type: string;
  methods: MethodInfo[];
  properties?: PropertyInfo[];
  dependencies: ObjectNode[];
  depth: number;
}

export interface ExtractionResult {
  success: boolean;
  data?: ObjectNode;
  textOutput?: string;
  jsonOutput?: string;
  error?: string;
  language: string;
  executionTimeMs: number;
}

export interface ExtractionRequest {
  language: 'python' | 'java' | 'csharp';
  sourceCode?: string;
  filePath?: string;
  className: string;
  maxDepth?: number;
  outputFormat?: 'json' | 'text' | 'both';
}

export type SupportedLanguage = 'python' | 'java' | 'csharp';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['python', 'java', 'csharp'];
