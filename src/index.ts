import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { registerDocumentationTools } from './infrastructure/adapters/documentation/tools.js';
import { registerCodeAnalysisTools } from './infrastructure/adapters/code-analysis/tools.js';

// Load environment variables
dotenv.config();

// Create MCP server instance
const server = new McpServer({
  name: 'NestJS & Angular Documentation MCP',
  description: 'A MCP service that analyzes NestJS and Angular codebases and provides best practice recommendations based on official documentation',
  version: '1.0.0'
});

// Register MCP tools for documentation analysis and code analysis
registerDocumentationTools(server);
registerCodeAnalysisTools(server);

// Start MCP server
const transport = new StdioServerTransport();
await server.connect(transport);

console.log('MCP server started');