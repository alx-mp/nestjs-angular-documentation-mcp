import { CodeAnalysisResult, CodeFile } from "../entities/code-analysis.js";

/**
 * Port for analyzing code files against best practices
 */
export interface CodeAnalysisRepository {
  /**
   * Analyzes a code file for issues and best practice compliance
   */
  analyzeFile(file: CodeFile, framework: string): Promise<CodeAnalysisResult>;
  
  /**
   * Analyzes multiple code files in a project
   */
  analyzeProject(files: CodeFile[], framework: string): Promise<CodeAnalysisResult[]>;
  
  /**
   * Determines the framework and file type of a given code file
   */
  detectFileType(file: CodeFile): Promise<CodeFile>;
  
  /**
   * Generates fix suggestions for identified code issues
   */
  generateFixSuggestions(analysisResult: CodeAnalysisResult): Promise<string[]>;
}