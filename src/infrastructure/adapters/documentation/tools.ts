import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { WebDocumentationRepository } from "./web-documentation-repository.js";

/**
 * Registers documentation-related tools with the MCP server
 */
export function registerDocumentationTools(server: McpServer): void {
  const documentationRepository = new WebDocumentationRepository();

  // Tool to search for best practices in documentation
  server.tool("searchDocumentation", "Search for best practices and guidelines in Angular or NestJS documentation", {
    framework: z.enum(['angular', 'nestjs']).describe("The framework to search documentation for (angular or nestjs)"),
    query: z.string().describe("The search query for finding relevant documentation")
  },
  async ({ framework, query }) => {
    try {
      // Get documentation sources for the framework
      const sources = await documentationRepository.getDocumentationSources(framework);
      if (sources.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "error",
                message: `No documentation sources found for framework: ${framework}`
              }, null, 2)
            }
          ]
        };
      }

      // Select the GitHub source
      const sourceToUse = sources[0]; // Only GitHub sources are available now

      // Search for topics matching the query
      const topics = await documentationRepository.searchTopics(sourceToUse.getId(), query);
      
      if (topics.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "warning",
                message: `No documentation found for query: ${query} in ${framework}. Try a different search term.`
              }, null, 2)
            }
          ]
        };
      }

      // Return the found documentation topics
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              source: {
                name: sourceToUse.getName(),
                id: sourceToUse.getId(),
                url: sourceToUse.getBaseUrl()
              },
              results: topics.map(topic => ({
                title: topic.getTitle(),
                url: topic.getUrl(),
                content: topic.getContent() 
                  ? (topic.getContent().length > 500 
                    ? topic.getContent().substring(0, 500) + "..." 
                    : topic.getContent())
                  : "Content will be loaded when requested",
                bestPractices: topic.getBestPractices(),
                codeExamples: topic.getCodeExamples()
              })),
              resultCount: topics.length
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error searching documentation:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error searching documentation: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });

  // Tool to get best practices for a specific component
  server.tool("getBestPractices", "Get best practices for a specific component or pattern in Angular or NestJS", {
    framework: z.enum(['angular', 'nestjs']).describe("The framework to get best practices for (angular or nestjs)"),
    component: z.string().describe("The component or pattern to get best practices for (e.g., 'controller', 'component', 'service')"),
    includeExamples: z.boolean().optional().describe("Whether to include code examples with the best practices")
  },
  async ({ framework, component, includeExamples = true }) => {
    try {
      const bestPractices = await documentationRepository.getBestPractices(framework, component);
      
      if (bestPractices.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "warning",
                message: `No best practices found for ${component} in ${framework}. Try a more general term like 'component', 'module', or 'service'.`
              }, null, 2)
            }
          ]
        };
      }

      // Process best practices to optionally include or exclude code examples
      let processedPractices = bestPractices;
      if (!includeExamples) {
        // Remove code blocks if examples are not requested
        processedPractices = bestPractices.map(practice => 
          practice.replace(/```(?:typescript|javascript|html)[\s\S]*?```/g, '[Code example omitted]')
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              framework,
              component,
              count: processedPractices.length,
              bestPractices: processedPractices.map((practice, index) => ({
                id: index + 1,
                content: practice,
                // Extract a title from the practice if it has one
                title: (practice.match(/^#+\s+(.+)$/m) || [])[1] || `Best Practice ${index + 1} for ${component}`
              }))
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error getting best practices:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error getting best practices: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });

  // Tool to browse framework documentation structure
  server.tool("browseDocumentation", "Browse the structure of Angular or NestJS documentation", {
    framework: z.enum(['angular', 'nestjs']).describe("The framework to browse documentation for (angular or nestjs)")
  },
  async ({ framework }) => {
    try {
      const sources = await documentationRepository.getDocumentationSources(framework);
      
      if (sources.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "error",
                message: `No documentation sources found for framework: ${framework}`
              }, null, 2)
            }
          ]
        };
      }

      // Build response with GitHub sources
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              framework,
              sources: sources.map(source => ({
                name: source.getName(),
                id: source.getId(),
                url: source.getBaseUrl(),
                version: source.getVersion(),
                sections: source.getSections().map(section => ({
                  id: section.getId(),
                  title: section.getTitle(),
                  url: section.getUrl(),
                  topicCount: section.getTopics().length,
                  // Include first few topics as a preview
                  topicPreview: section.getTopics().slice(0, 5).map(topic => ({
                    id: topic.getId(),
                    title: topic.getTitle()
                  }))
                }))
              }))
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error browsing documentation:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error browsing documentation: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });

  // Tool to get documentation content by topic ID
  server.tool("getDocumentationTopic", "Get the full content of a specific documentation topic", {
    sourceId: z.string().describe("The ID of the documentation source"),
    topicId: z.string().describe("The ID of the documentation topic")
  },
  async ({ sourceId, topicId }) => {
    try {
      const topic = await documentationRepository.getTopicById(sourceId, topicId);
      
      if (!topic) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "error",
                message: `Topic not found with ID: ${topicId} in source: ${sourceId}`
              }, null, 2)
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              topic: {
                id: topic.getId(),
                title: topic.getTitle(),
                url: topic.getUrl(),
                content: topic.getContent(),
                bestPractices: topic.getBestPractices(),
                codeExamples: topic.getCodeExamples()
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error getting documentation topic:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message: `Error getting documentation topic: ${errorMessage}`
            }, null, 2)
          }
        ]
      };
    }
  });
}