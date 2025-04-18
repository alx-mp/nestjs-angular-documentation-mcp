import { DocumentationSource, DocumentationTopic } from "../entities/documentation.js";


/**
 * Port for fetching documentation from external sources
 */
export interface DocumentationRepository {
  /**
   * Fetches documentation sources for a given framework
   */
  getDocumentationSources(framework: string): Promise<DocumentationSource[]>;
  
  /**
   * Fetches a specific documentation topic by its ID
   */
  getTopicById(sourceId: string, topicId: string): Promise<DocumentationTopic | null>;
  
  /**
   * Searches for documentation topics based on a query
   */
  searchTopics(sourceId: string, query: string): Promise<DocumentationTopic[]>;
  
  /**
   * Fetches best practices for a specific framework component or pattern
   */
  getBestPractices(framework: string, component: string): Promise<string[]>;
}