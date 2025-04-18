import { DocumentationSection, DocumentationSource, DocumentationTopic } from "@/core/domain/entities/documentation.js";
import { DocumentationRepository } from "@/core/domain/interfaces/documentation-repository.js";
import axios from "axios";

/**
 * Adapter for fetching and processing documentation from NestJS and Angular GitHub repositories
 */
export class WebDocumentationRepository implements DocumentationRepository {
  // GitHub API base URLs for raw content
  private readonly GITHUB_RAW_CONTENT_BASE = 'https://raw.githubusercontent.com';
  private readonly GITHUB_API_BASE = 'https://api.github.com/repos';
  
  private readonly frameworkSources: Record<string, DocumentationSource[]> = {
    nestjs: [
      new DocumentationSource(
        'nestjs-github',
        'NestJS Documentation (GitHub)',
        'https://github.com/nestjs/docs.nestjs.com/tree/master/content',
        'master',
        []
      )
    ],
    angular: [
      new DocumentationSource(
        'angular-github',
        'Angular Documentation (GitHub)',
        'https://github.com/angular/angular/tree/main/adev/src/content/guide',
        'main',
        []
      )
    ]
  };

  /**
   * Fetches documentation sources for a given framework
   */
  async getDocumentationSources(framework: string): Promise<DocumentationSource[]> {
    const normalizedFramework = framework.toLowerCase();
    
    if (!this.frameworkSources[normalizedFramework]) {
      return [];
    }
    
    // If the sections are not yet loaded, fetch them
    const sources = this.frameworkSources[normalizedFramework];
    for (const source of sources) {
      if (source.getSections().length === 0) {
        await this.fetchSections(source);
      }
    }
    
    return sources;
  }

  /**
   * Fetches a specific documentation topic by its ID
   */
  async getTopicById(sourceId: string, topicId: string): Promise<DocumentationTopic | null> {
    let foundTopic: DocumentationTopic | null = null;
    
    // Search through all framework sources
    for (const frameworkSources of Object.values(this.frameworkSources)) {
      for (const source of frameworkSources) {
        if (source.getId() === sourceId) {
          // Search through all sections
          for (const section of source.getSections()) {
            for (const topic of section.getTopics()) {
              if (topic.getId() === topicId) {
                foundTopic = topic;
                break;
              }
            }
            if (foundTopic) break;
          }
        }
        if (foundTopic) break;
      }
      if (foundTopic) break;
    }
    
    // If found but content is empty, fetch full content
    if (foundTopic && !foundTopic.getContent()) {
      return await this.fetchTopicContent(foundTopic);
    }
    
    return foundTopic;
  }

  /**
   * Searches for documentation topics based on a query
   */
  async searchTopics(sourceId: string, query: string): Promise<DocumentationTopic[]> {
    const results: DocumentationTopic[] = [];
    const normalizedQuery = query.toLowerCase();
    
    // Find the source
    let source: DocumentationSource | null = null;
    for (const frameworkSources of Object.values(this.frameworkSources)) {
      for (const s of frameworkSources) {
        if (s.getId() === sourceId) {
          source = s;
          break;
        }
      }
      if (source) break;
    }
    
    if (!source) return results;
    
    // Search through all sections and topics
    for (const section of source.getSections()) {
      for (const topic of section.getTopics()) {
        // Ensure topic has content for search
        let topicWithContent = topic;
        if (!topic.getContent()) {
          topicWithContent = await this.fetchTopicContent(topic) || topic;
        }
        
        if (
          topicWithContent.getTitle().toLowerCase().includes(normalizedQuery) ||
          topicWithContent.getContent().toLowerCase().includes(normalizedQuery)
        ) {
          results.push(topicWithContent);
        }
      }
    }
    
    return results;
  }

  /**
   * Fetches best practices for a specific framework component or pattern
   */
  async getBestPractices(framework: string, component: string): Promise<string[]> {
    const normalizedFramework = framework.toLowerCase();
    const normalizedComponent = component.toLowerCase();
    
    // Search for topics related to the component
    const sources = await this.getDocumentationSources(normalizedFramework);
    if (sources.length === 0) return [];
    
    const bestPractices: string[] = [];
    
    for (const source of sources) {
      for (const section of source.getSections()) {
        for (const topic of section.getTopics()) {
          // Ensure topic has content for search
          let topicWithContent = topic;
          if (!topic.getContent()) {
            topicWithContent = await this.fetchTopicContent(topic) || topic;
          }
          
          // Check if the topic is related to the component
          if (
            topicWithContent.getTitle().toLowerCase().includes(normalizedComponent) ||
            topicWithContent.getContent().toLowerCase().includes(normalizedComponent)
          ) {
            // Extract best practices content
            const content = await this.extractBestPractices(topicWithContent);
            if (content.length > 0) {
              bestPractices.push(...content);
            }
          }
        }
      }
    }
    
    return bestPractices;
  }

  /**
   * Fetches all sections for a documentation source
   */
  private async fetchSections(source: DocumentationSource): Promise<void> {
    try {
      if (source.getId().includes('nestjs')) {
        await this.fetchNestJSGitHubSections(source);
      } else if (source.getId().includes('angular')) {
        await this.fetchAngularGitHubSections(source);
      }
    } catch (error) {
      console.error(`Error fetching documentation sections for ${source.getName()}:`, error);
    }
  }

  /**
   * Fetches NestJS documentation sections from GitHub repository
   */
  private async fetchNestJSGitHubSections(source: DocumentationSource): Promise<void> {
    try {
      // Parse GitHub URL to extract owner, repo, and path
      const urlParts = source.getBaseUrl().replace('https://github.com/', '').split('/');
      const owner = urlParts[0];
      const repo = urlParts[1];
      const branch = source.getVersion();
      const path = urlParts.slice(4).join('/');
      
      // Fetch directory contents using GitHub API
      const apiUrl = `${this.GITHUB_API_BASE}/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await axios.get(apiUrl);
      
      if (Array.isArray(response.data)) {
        // Group by major categories for better organization
        const mainSections: Record<string, DocumentationSection> = {};
        
        for (const item of response.data) {
          if (item.type === 'dir') {
            // Create a section for each directory
            const sectionTitle = item.name
              .replace(/-/g, ' ')
              .replace(/^\w/, (c: string) => c.toUpperCase())
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
              
            const section = new DocumentationSection(
              `section-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
              sectionTitle,
              item.html_url
            );
            
            // Store the section for later topic fetching
            mainSections[item.name] = section;
            
            // Fetch topics within this section
            await this.fetchNestJSGitHubTopics(section, item.url);
            
            // Only add non-empty sections
            if (section.getTopics().length > 0) {
              source.addSection(section);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching NestJS GitHub sections:', error);
    }
  }

  /**
   * Fetches NestJS documentation topics from GitHub repository
   */
  private async fetchNestJSGitHubTopics(section: DocumentationSection, url: string): Promise<void> {
    try {
      const response = await axios.get(url);
      
      if (Array.isArray(response.data)) {
        for (const item of response.data) {
          if (item.type === 'file' && item.name.endsWith('.md')) {
            // Create a topic for each markdown file
            // Format the title to be more readable
            const title = item.name
              .replace('.md', '')
              .replace(/-/g, ' ')
              .replace(/^\w|\s\w/g, (c: string) => c.toUpperCase());
            
            // Determine the raw content URL
            const rawUrl = item.download_url;
            
            // Create initial topic object (content will be loaded on demand)
            const topic = new DocumentationTopic(
              `topic-${item.name.toLowerCase().replace(/\s+/g, '-').replace('.md', '')}`,
              title,
              item.html_url,
              '', // Content will be loaded on demand
              [],
              []
            );
            
            section.addTopic(topic);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching NestJS GitHub topics:', error);
    }
  }

  /**
   * Fetches Angular documentation sections from GitHub repository
   */
  private async fetchAngularGitHubSections(source: DocumentationSource): Promise<void> {
    try {
      // Parse GitHub URL to extract owner, repo, and path
      const urlParts = source.getBaseUrl().replace('https://github.com/', '').split('/');
      const owner = urlParts[0];
      const repo = urlParts[1];
      const branch = source.getVersion();
      const path = urlParts.slice(4).join('/');
      
      // Fetch directory contents using GitHub API
      const apiUrl = `${this.GITHUB_API_BASE}/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await axios.get(apiUrl);
      
      if (Array.isArray(response.data)) {
        // Create logical section categories for Angular
        const sections: Record<string, DocumentationSection> = {
          'fundamentals': new DocumentationSection(
            'section-fundamentals',
            'Fundamentals',
            `https://github.com/${owner}/${repo}/tree/${branch}/${path}/fundamentals`
          ),
          'components': new DocumentationSection(
            'section-components',
            'Components',
            `https://github.com/${owner}/${repo}/tree/${branch}/${path}/components`
          ),
          'dependency-injection': new DocumentationSection(
            'section-dependency-injection',
            'Dependency Injection',
            `https://github.com/${owner}/${repo}/tree/${branch}/${path}/di`
          ),
          'forms': new DocumentationSection(
            'section-forms',
            'Forms',
            `https://github.com/${owner}/${repo}/tree/${branch}/${path}/forms`
          ),
          'routing': new DocumentationSection(
            'section-routing',
            'Routing',
            `https://github.com/${owner}/${repo}/tree/${branch}/${path}/routing`
          ),
          'best-practices': new DocumentationSection(
            'section-best-practices',
            'Best Practices & Style Guide',
            `https://github.com/${owner}/${repo}/tree/${branch}/${path}/style-guide`
          ),
          'other': new DocumentationSection(
            'section-other',
            'Other Topics',
            `https://github.com/${owner}/${repo}/tree/${branch}/${path}`
          )
        };
        
        // Process directories first to organize content by category
        for (const item of response.data) {
          if (item.type === 'dir') {
            // Check if this is a special directory we want as its own section
            const dirName = item.name.toLowerCase();
            
            // Create or update sections based on directory name
            if (['components', 'forms', 'routing', 'di', 'style-guide'].includes(dirName)) {
              // For known category directories, fetch their contents directly
              const sectionKey = dirName === 'di' ? 'dependency-injection' : 
                               dirName === 'style-guide' ? 'best-practices' : dirName;
              
              await this.fetchAngularDirectoryTopics(sections[sectionKey], item.url);
            } else {
              // For other directories, create a new section or add to 'other'
              const sectionTitle = item.name
                .replace(/-/g, ' ')
                .replace(/^\w/, (c: string) => c.toUpperCase())
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
                
              const section = new DocumentationSection(
                `section-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
                sectionTitle,
                item.html_url
              );
              
              await this.fetchAngularDirectoryTopics(section, item.url);
              
              // Only add non-empty sections
              if (section.getTopics().length > 0) {
                source.addSection(section);
              }
            }
          } else if (item.type === 'file' && item.name.endsWith('.md')) {
            // Process top-level markdown files
            // Determine which section this topic belongs to based on filename or content
            const downloadUrl = item.download_url;
            try {
              const content = await this.fetchRawGitHubContent(downloadUrl);
              const title = this.extractTitleFromMarkdown(content) || 
                          item.name.replace('.md', '').replace(/-/g, ' ').replace(/^\w|\s\w/g, (c: string) => c.toUpperCase());
              
              // Categorize based on content or filename
              let targetSection = sections.other;
              const lowerContent = content.toLowerCase();
              const lowerFilename = item.name.toLowerCase();
              
              if (lowerContent.includes('component') || lowerFilename.includes('component')) {
                targetSection = sections.components;
              } else if (lowerContent.includes('dependency injection') || lowerFilename.includes('inject')) {
                targetSection = sections['dependency-injection'];
              } else if (lowerContent.includes('form') || lowerFilename.includes('form')) {
                targetSection = sections.forms;
              } else if (lowerContent.includes('router') || lowerContent.includes('routing') || 
                        lowerFilename.includes('route') || lowerFilename.includes('navigation')) {
                targetSection = sections.routing;
              } else if (lowerContent.includes('best practice') || lowerContent.includes('style guide') || 
                        lowerFilename.includes('best') || lowerFilename.includes('style')) {
                targetSection = sections['best-practices'];
              } else if (lowerFilename.match(/^(introduction|getting-started|overview|concept)/)) {
                targetSection = sections.fundamentals;
              }
              
              const topic = new DocumentationTopic(
                `topic-${item.name.toLowerCase().replace(/\s+/g, '-').replace('.md', '')}`,
                title,
                item.html_url,
                content,  // Include content since we already fetched it
                [],
                this.extractCodeExamples(content)
              );
              
              targetSection.addTopic(topic);
            } catch (error) {
              console.error(`Error processing Angular file ${item.name}:`, error);
            }
          }
        }
        
        // Add non-empty sections to the source
        for (const sectionKey in sections) {
          if (sections[sectionKey].getTopics().length > 0) {
            source.addSection(sections[sectionKey]);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Angular GitHub sections:', error);
    }
  }

  /**
   * Fetches topics from an Angular documentation directory
   */
  private async fetchAngularDirectoryTopics(section: DocumentationSection, url: string): Promise<void> {
    try {
      const response = await axios.get(url);
      
      if (Array.isArray(response.data)) {
        for (const item of response.data) {
          if (item.type === 'file' && item.name.endsWith('.md')) {
            try {
              // Fetch the content to extract a proper title
              const content = await this.fetchRawGitHubContent(item.download_url);
              
              // Try to extract title from the markdown content or format the filename
              const title = this.extractTitleFromMarkdown(content) || 
                          item.name.replace('.md', '').replace(/-/g, ' ').replace(/^\w|\s\w/g, (c: string) => c.toUpperCase());
              
              const topic = new DocumentationTopic(
                `topic-${item.name.toLowerCase().replace(/\s+/g, '-').replace('.md', '')}`,
                title,
                item.html_url,
                content,  // Include content since we already fetched it
                [],
                this.extractCodeExamples(content)
              );
              
              section.addTopic(topic);
            } catch (error) {
              console.error(`Error processing Angular directory file ${item.name}:`, error);
              
              // Fallback to creating a topic without content
              const title = item.name.replace('.md', '').replace(/-/g, ' ').replace(/^\w|\s\w/g, (c: string) => c.toUpperCase());
              
              const topic = new DocumentationTopic(
                `topic-${item.name.toLowerCase().replace(/\s+/g, '-').replace('.md', '')}`,
                title,
                item.html_url,
                '', // Content will be loaded on demand
                [],
                []
              );
              
              section.addTopic(topic);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Angular directory topics:', error);
    }
  }

  /**
   * Fetches raw content from GitHub URL
   */
  private async fetchRawGitHubContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching GitHub content from ${url}:`, error);
      return '';
    }
  }

  /**
   * Extracts title from markdown content
   */
  private extractTitleFromMarkdown(content: string): string | null {
    // Look for the first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  /**
   * Extracts code examples from markdown content
   */
  private extractCodeExamples(content: string): string[] {
    const codeExamples: string[] = [];
    
    // Find code blocks with language identifiers
    const codeBlocks = content.match(/```(?:typescript|javascript|html|css|bash|json)[\s\S]*?```/g);
    
    if (codeBlocks) {
      for (const block of codeBlocks) {
        codeExamples.push(block);
      }
    }
    
    return codeExamples;
  }

  /**
   * Fetches full content for a topic
   */
  private async fetchTopicContent(topic: DocumentationTopic): Promise<DocumentationTopic> {
    try {
      // For GitHub URLs, convert to raw content URL and fetch
      const rawUrl = topic.getUrl()
        .replace('https://github.com', this.GITHUB_RAW_CONTENT_BASE)
        .replace('/blob/', '/')
        .replace('/tree/', '/');
      
      const content = await this.fetchRawGitHubContent(rawUrl);
      
      // Extract code examples while we have the content
      const codeExamples = this.extractCodeExamples(content);
      
      return new DocumentationTopic(
        topic.getId(),
        topic.getTitle(),
        topic.getUrl(),
        content,
        topic.getBestPractices(),
        codeExamples
      );
    } catch (error) {
      console.error(`Error fetching topic content for ${topic.getTitle()}:`, error);
      return topic;
    }
  }

  /**
   * Extracts best practices from a documentation topic
   */
  private async extractBestPractices(topic: DocumentationTopic): Promise<string[]> {
    const bestPractices: string[] = [];
    
    try {
      // If topic content is not loaded, fetch it
      let fullTopic = topic;
      if (!topic.getContent()) {
        fullTopic = await this.fetchTopicContent(topic) || topic;
      }
      
      const content = fullTopic.getContent();
      
      // Enhanced best practice detection logic for markdown format
      
      // 1. Extract sections with "best practices" in the heading
      const bestPracticeHeadings = [
        /#{1,3}\s+Best\s+Practices/i,
        /#{1,3}\s+Recommended\s+Practices/i,
        /#{1,3}\s+Style\s+Guide/i,
        /#{1,3}\s+Guidelines/i,
        /#{1,3}\s+Conventions/i
      ];
      
      for (const heading of bestPracticeHeadings) {
        const match = content.match(new RegExp(`(${heading.source}[\\s\\S]*?)(?=#{1,3}\\s+|$)`, 'i'));
        if (match && match[1]) {
          bestPractices.push(match[1].trim());
        }
      }
      
      // 2. Look for bullet lists that mention best practices
      const bulletListSections = content.match(/(?:(?:\r?\n|\r)(?:\*|\-|\d+\.)\s+.+)+/g);
      if (bulletListSections) {
        for (const section of bulletListSections) {
          if (
            section.toLowerCase().includes('best practice') ||
            section.toLowerCase().includes('recommend') ||
            section.toLowerCase().includes('should') ||
            section.toLowerCase().includes('always') ||
            section.toLowerCase().includes('never')
          ) {
            bestPractices.push(section.trim());
          }
        }
      }
      
      // 3. Look for code examples that demonstrate best practices
      const codeBlocks = content.match(/```(?:typescript|javascript|html)[\s\S]*?```/g);
      if (codeBlocks) {
        for (const block of codeBlocks) {
          const precedingText = content.substring(
            Math.max(0, content.indexOf(block) - 200),
            content.indexOf(block)
          );
          
          if (
            precedingText.toLowerCase().includes('best practice') ||
            precedingText.toLowerCase().includes('recommend') ||
            precedingText.toLowerCase().includes('preferred way') ||
            precedingText.toLowerCase().includes('correct') ||
            precedingText.toLowerCase().includes('example')
          ) {
            bestPractices.push(precedingText.trim() + '\n\n' + block);
          }
        }
      }
      
      // 4. Extract "Do's and Don'ts" sections
      const dosAndDonts = content.match(/#{1,3}\s+Do['']s and Don['']ts[\s\S]*?(?=#{1,3}\s+|$)/i);
      if (dosAndDonts) {
        bestPractices.push(dosAndDonts[0].trim());
      }
    } catch (error) {
      console.error(`Error extracting best practices for ${topic.getTitle()}:`, error);
    }
    
    return bestPractices;
  }
}