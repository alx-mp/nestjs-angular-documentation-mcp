import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebDocumentationRepository } from "../documentation/web-documentation-repository.js";
import { TsMorphCodeAnalysisRepository } from "./ts-morph-code-analysis-repository.js";
import { CodeFile, CodeFileType, CodeLanguage, IssueSeverity } from "../../../core/domain/entities/code-analysis.js";
import { z } from 'zod';

/**
 * Registers code analysis tools with the MCP server
 */
export function registerCodeAnalysisTools(server: McpServer): void {
  const documentationRepository = new WebDocumentationRepository();
  const codeAnalysisRepository = new TsMorphCodeAnalysisRepository(documentationRepository);

  // Tool to analyze a single code file against best practices
  server.tool("analyzeCodeFile", "Analyze a single code file for compliance with Angular or NestJS best practices", {
    filePath: z.string().describe("Path to the file to analyze"),
    fileContent: z.string().describe("Content of the file to analyze"),
    framework: z.enum(['angular', 'nestjs']).describe("The framework to analyze against (angular or nestjs)")
  },
  async ({ filePath, fileContent, framework }) => {
    try {
      // Create a code file with unknown language and file type (they will be detected)
      const codeFile = new CodeFile(
        filePath,
        fileContent,
        CodeLanguage.UNKNOWN,
        CodeFileType.UNKNOWN
      );
      
      // Analyze the file
      const analysisResult = await codeAnalysisRepository.analyzeFile(codeFile, framework);
      
      // Generate fix suggestions if there are issues
      let fixSuggestions: string[] = [];
      if (analysisResult.hasIssues()) {
        fixSuggestions = await codeAnalysisRepository.generateFixSuggestions(analysisResult);
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              fileInfo: {
                path: analysisResult.getFile().getPath(),
                language: analysisResult.getFile().getLanguage(),
                fileType: analysisResult.getFile().getFileType()
              },
              issues: analysisResult.getIssues().map(issue => ({
                id: issue.getId(),
                description: issue.getDescription(),
                severity: issue.getSeverity(),
                lineStart: issue.getLineStart(),
                lineEnd: issue.getLineEnd()
              })),
              bestPractices: analysisResult.getBestPractices().map(bp => ({
                id: bp.getId(),
                title: bp.getTitle(),
                description: bp.getDescription().substring(0, 200) + "...", // Truncate for display
              })),
              fixSuggestions
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error analyzing code file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error analyzing code file: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });

  // Tool to analyze multiple files in a project
  server.tool("analyzeProject", "Analyze multiple files in a project for compliance with Angular or NestJS best practices", {
    files: z.array(z.object({
      path: z.string().describe("Path to the file"),
      content: z.string().describe("Content of the file")
    })).describe("Array of files to analyze"),
    framework: z.enum(['angular', 'nestjs']).describe("The framework to analyze against (angular or nestjs)")
  },
  async ({ files, framework }) => {
    try {
      // Create code files with unknown language and file type (they will be detected)
      const codeFiles = files.map(file => 
        new CodeFile(file.path, file.content, CodeLanguage.UNKNOWN, CodeFileType.UNKNOWN)
      );
      
      // Analyze the project
      const analysisResults = await codeAnalysisRepository.analyzeProject(codeFiles, framework);
      
      // Process results
      const results = await Promise.all(analysisResults.map(async result => {
        let fixSuggestions: string[] = [];
        if (result.hasIssues()) {
          fixSuggestions = await codeAnalysisRepository.generateFixSuggestions(result);
        }
        
        return {
          fileInfo: {
            path: result.getFile().getPath(),
            language: result.getFile().getLanguage(),
            fileType: result.getFile().getFileType()
          },
          issues: result.getIssues().map(issue => ({
            id: issue.getId(),
            description: issue.getDescription(),
            severity: issue.getSeverity(),
            lineStart: issue.getLineStart(),
            lineEnd: issue.getLineEnd()
          })),
          fixSuggestions
        };
      }));
      
      // Aggregate project-level statistics
      const totalFiles = results.length;
      const filesWithIssues = results.filter(r => r.issues.length > 0).length;
      const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
      const issuesBySeverity = {
        [IssueSeverity.ERROR]: results.reduce((sum, r) => 
          sum + r.issues.filter(i => i.severity === IssueSeverity.ERROR).length, 0),
        [IssueSeverity.WARNING]: results.reduce((sum, r) => 
          sum + r.issues.filter(i => i.severity === IssueSeverity.WARNING).length, 0),
        [IssueSeverity.INFO]: results.reduce((sum, r) => 
          sum + r.issues.filter(i => i.severity === IssueSeverity.INFO).length, 0)
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              projectSummary: {
                totalFiles,
                filesWithIssues,
                totalIssues,
                issuesBySeverity
              },
              results
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error analyzing project:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error analyzing project: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });

  // Tool to generate fix suggestions for issues
  server.tool("generateFixSuggestions", "Generate suggestions for fixing code issues in Angular or NestJS projects", {
    filePath: z.string().describe("Path to the file with issues"),
    fileContent: z.string().describe("Content of the file with issues"),
    framework: z.enum(['angular', 'nestjs']).describe("The framework of the code (angular or nestjs)")
  },
  async ({ filePath, fileContent, framework }) => {
    try {
      // Create a code file
      const codeFile = new CodeFile(
        filePath,
        fileContent,
        CodeLanguage.UNKNOWN,
        CodeFileType.UNKNOWN
      );
      
      // Analyze the file to find issues
      const analysisResult = await codeAnalysisRepository.analyzeFile(codeFile, framework);
      
      if (!analysisResult.hasIssues()) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                message: "No issues found in the file!",
                suggestions: []
              }, null, 2)
            }
          ]
        };
      }
      
      // Generate fix suggestions
      const suggestions = await codeAnalysisRepository.generateFixSuggestions(analysisResult);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              fileInfo: {
                path: analysisResult.getFile().getPath(),
                language: analysisResult.getFile().getLanguage(),
                fileType: analysisResult.getFile().getFileType()
              },
              issueCount: analysisResult.getIssues().length,
              suggestions
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error generating fix suggestions:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error generating fix suggestions: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });

  // Tool to identify the framework and file type of a code file
  server.tool("detectFrameworkAndFileType", "Identify the framework and file type of a code file", {
    filePath: z.string().describe("Path to the file to analyze"),
    fileContent: z.string().describe("Content of the file to analyze")
  },
  async ({ filePath, fileContent }) => {
    try {
      // Create a code file with unknown language and file type
      const codeFile = new CodeFile(
        filePath,
        fileContent,
        CodeLanguage.UNKNOWN,
        CodeFileType.UNKNOWN
      );
      
      // Detect file type
      const detectedFile = await codeAnalysisRepository.detectFileType(codeFile);
      const fileType = detectedFile.getFileType();
      
      // Determine framework based on file type
      let framework = '';
      if (fileType.toString().startsWith('ANGULAR_')) {
        framework = 'angular';
      } else if (fileType.toString().startsWith('NESTJS_')) {
        framework = 'nestjs';
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              fileInfo: {
                path: detectedFile.getPath(),
                language: detectedFile.getLanguage(),
                fileType: detectedFile.getFileType(),
                framework
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error detecting framework and file type:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error detecting framework and file type: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });
}