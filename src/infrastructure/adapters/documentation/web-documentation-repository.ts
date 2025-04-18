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
   * Extracts code from a GitHub file path and visible region
   * 
   * This method handles the extraction of code fragments from Angular documentation examples
   * such as <docs-code path="adev/src/content/examples/form-validation/src/app/template/actor-form-template.component.html" visibleRegion="name-with-error-msg"/>
   */
  async extractCodeFromDocumentationPath(repoPath: string, visibleRegion?: string): Promise<string> {
    try {
      // Parse the path to determine GitHub path structure
      // Format: adev/src/content/examples/form-validation/src/app/template/actor-form-template.component.html
      if (!repoPath) {
        return '';
      }

      // Determinar el repositorio y propietario basado en la ruta
      let owner = 'angular';
      let repo = 'angular';
      let branch = 'main';
      
      // Comprobar si la ruta indica un repositorio NestJS
      if (repoPath.includes('nestjs') || repoPath.includes('docs.nestjs.com')) {
        owner = 'nestjs';
        repo = 'docs.nestjs.com';
        branch = 'master';
      }
      
      // Limpiar la ruta si contiene prefijos de repositorio
      let cleanPath = repoPath;
      if (cleanPath.startsWith('https://github.com/')) {
        const parts = cleanPath.replace('https://github.com/', '').split('/');
        if (parts.length >= 2) {
          owner = parts[0];
          repo = parts[1];
          
          // Extraer branch si está disponible
          if (parts.length >= 4 && (parts[2] === 'blob' || parts[2] === 'tree')) {
            branch = parts[3];
            cleanPath = parts.slice(4).join('/');
          } else {
            cleanPath = parts.slice(2).join('/');
          }
        }
      }
      
      console.log(`Extrayendo código de GitHub - Owner: ${owner}, Repo: ${repo}, Branch: ${branch}, Path: ${cleanPath}`);
      
      // Primero, intentar obtener metadatos del archivo a través de la API de GitHub
      const apiUrl = `${this.GITHUB_API_BASE}/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`;
      
      try {
        // Intentar obtener metadatos sobre el archivo
        const response = await axios.get(apiUrl);
        
        // Obtener la URL del contenido raw
        let rawUrl = '';
        if (response.data && response.data.download_url) {
          rawUrl = response.data.download_url;
        } else {
          // Intentar construir una URL directa
          rawUrl = `${this.GITHUB_RAW_CONTENT_BASE}/${owner}/${repo}/${branch}/${cleanPath}`;
        }
        
        // Obtener el contenido del archivo
        const contentResponse = await axios.get(rawUrl);
        let fileContent = contentResponse.data;
        
        // Si se solicita una región específica, extraer solo esa parte
        if (visibleRegion) {
          console.log(`Extrayendo región específica: ${visibleRegion}`);
          return this.extractVisibleRegion(fileContent, visibleRegion);
        }
        
        return fileContent;
      } catch (error) {
        console.error(`Error obteniendo código de GitHub para ruta ${cleanPath}:`, error);
        
        // Plan B: Intentar acceso directo al contenido raw
        try {
          const rawUrl = `${this.GITHUB_RAW_CONTENT_BASE}/${owner}/${repo}/${branch}/${cleanPath}`;
          console.log(`Intentando acceso directo a URL raw: ${rawUrl}`);
          
          const contentResponse = await axios.get(rawUrl);
          let fileContent = contentResponse.data;
          
          // Si se solicita una región específica, extraer solo esa parte
          if (visibleRegion) {
            return this.extractVisibleRegion(fileContent, visibleRegion);
          }
          
          return fileContent;
        } catch (fallbackError) {
          console.error(`El intento de fallback también falló para ${cleanPath}:`, fallbackError);
          
          // Plan C: Intentar buscar por nombre de archivo
          try {
            const fileName = cleanPath.split('/').pop();
            if (fileName) {
              console.log(`Intentando buscar archivo por nombre: ${fileName}`);
              
              // Obtener todas las secciones y temas
              const angularSources = await this.getDocumentationSources('angular');
              const nestjsSources = await this.getDocumentationSources('nestjs');
              const allSources = [...angularSources, ...nestjsSources];
              
              for (const source of allSources) {
                for (const section of source.getSections()) {
                  for (const topic of section.getTopics()) {
                    if (topic.getUrl().includes(fileName)) {
                      const fullTopic = await this.getTopicById(source.getId(), topic.getId());
                      if (fullTopic && fullTopic.getContent()) {
                        // Buscar el fragmento de código en el contenido
                        const codeExamples = fullTopic.getCodeExamples();
                        if (codeExamples.length > 0) {
                          // Intentar encontrar un ejemplo relevante al visibleRegion si se proporciona
                          if (visibleRegion) {
                            const matchingExample = codeExamples.find(ex => 
                              ex.includes(visibleRegion) || 
                              ex.toLowerCase().includes(fileName.toLowerCase())
                            );
                            if (matchingExample) {
                              return matchingExample;
                            }
                          }
                          
                          // Si no se encuentra una coincidencia específica, devolver el primer ejemplo
                          return codeExamples[0];
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (searchError) {
            console.error(`Error en la búsqueda por nombre de archivo:`, searchError);
          }
          
          return `// Error: No se pudo obtener el código para ${cleanPath}${visibleRegion ? ` con región ${visibleRegion}` : ''}`;
        }
      }
    } catch (error) {
      console.error(`Error procesando la extracción de código para ${repoPath}:`, error);
      return `// Error al procesar la solicitud de extracción de código`;
    }
  }
  
  /**
   * Extracts a specific region from file content
   * 
   * Angular documentation uses region markers like:
   * // #docregion name-with-error-msg
   * ...code...
   * // #enddocregion name-with-error-msg
   */
  private extractVisibleRegion(fileContent: string, regionName: string): string {
    if (!fileContent || !regionName) {
      return fileContent;
    }
    
    // Different file types use different comment styles for region markers
    const regionStartPatterns = [
      new RegExp(`//\\s*#docregion\\s+${regionName}[\\r\\n]`),
      new RegExp(`<!--\\s*#docregion\\s+${regionName}\\s*-->[\\r\\n]`),
      new RegExp(`/\\*\\s*#docregion\\s+${regionName}\\s*\\*/[\\r\\n]`)
    ];
    
    const regionEndPatterns = [
      new RegExp(`//\\s*#enddocregion\\s+${regionName}[\\r\\n]`),
      new RegExp(`<!--\\s*#enddocregion\\s+${regionName}\\s*-->[\\r\\n]`),
      new RegExp(`/\\*\\s*#enddocregion\\s+${regionName}\\s*\\*/[\\r\\n]`)
    ];
    
    // Find the start of the region
    let startIndex = -1;
    let startPattern = null;
    
    for (const pattern of regionStartPatterns) {
      const match = pattern.exec(fileContent);
      if (match && (startIndex === -1 || match.index < startIndex)) {
        startIndex = match.index;
        startPattern = pattern;
      }
    }
    
    if (startIndex === -1) {
      // If no explicit region found, return the whole content
      return fileContent;
    }
    
    // Find the end position (after the start marker)
    const contentAfterStart = fileContent.substring(startIndex);
    let endRelativeIndex = -1;
    
    for (const pattern of regionEndPatterns) {
      const match = pattern.exec(contentAfterStart);
      if (match && (endRelativeIndex === -1 || match.index < endRelativeIndex)) {
        endRelativeIndex = match.index;
      }
    }
    
    if (endRelativeIndex === -1) {
      // If no end marker found, return the rest of the file
      return contentAfterStart.substring(startPattern?.exec(contentAfterStart)?.[0].length || 0);
    }
    
    // Extract the content between markers
    const startMarkerMatch = startPattern?.exec(contentAfterStart)?.[0] || '';
    const extractedContent = contentAfterStart.substring(
      startMarkerMatch.length,
      endRelativeIndex
    );
    
    return extractedContent.trim();
  }

  /**
   * Parses a docs-code element to extract path and visibleRegion
   * 
   * Takes a string like:
   * <docs-code header="template/actor-form-template.component.html (name)" path="adev/src/content/examples/form-validation/src/app/template/actor-form-template.component.html" visibleRegion="name-with-error-msg"/>
   */
  async extractDocsCodeExample(docsCodeElement: string): Promise<string> {
    if (!docsCodeElement) return '';
    
    try {
      // Extract path attribute
      const pathMatch = docsCodeElement.match(/path=["']([^"']+)["']/);
      const path = pathMatch ? pathMatch[1] : '';
      
      // Extract visibleRegion attribute
      const regionMatch = docsCodeElement.match(/visibleRegion=["']([^"']+)["']/);
      const region = regionMatch ? regionMatch[1] : '';
      
      // Extract header/description (optional)
      const headerMatch = docsCodeElement.match(/header=["']([^"']+)["']/);
      const header = headerMatch ? headerMatch[1] : '';
      
      if (!path) {
        return `// No path found in docs-code element: ${docsCodeElement}`;
      }
      
      // Fetch the code
      const code = await this.extractCodeFromDocumentationPath(path, region);
      
      // Format with header if present
      if (header) {
        return `// ${header}\n${code}`;
      }
      
      return code;
    } catch (error) {
      console.error(`Error extracting docs-code example:`, error);
      return `// Error extracting code example from: ${docsCodeElement}`;
    }
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
    // Intentar extraer primero de los encabezados de primer nivel (# Title)
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }
    
    // Intentar con encabezados decorativos específicos de Angular
    const decorativeMatch = content.match(/<docs-decorative-header\s+title="([^"]+)"/);
    if (decorativeMatch && decorativeMatch[1]) {
      return decorativeMatch[1].trim();
    }
    
    // Buscar encabezados de segundo nivel si no hay de primer nivel
    const h2Match = content.match(/^##\s+(.+)$/m);
    if (h2Match && h2Match[1]) {
      return h2Match[1].trim();
    }
    
    // Buscar la primera línea no vacía como último recurso
    const firstLineMatch = content.match(/^(.+)$/m);
    return firstLineMatch ? firstLineMatch[1].trim() : null;
  }

  /**
   * Extracts code examples from markdown content
   */
  private extractCodeExamples(content: string): string[] {
    const codeExamples: string[] = [];
    
    // Extract code blocks with markdown code fence
    const codeBlockRegex = /```(?:typescript|javascript|html|css)[\s\S]*?```/g;
    const codeBlocks = content.match(codeBlockRegex);
    
    if (codeBlocks) {
      for (const block of codeBlocks) {
        // Clean up the code block by removing the markdown code fence
        const cleanCode = block
          .replace(/^```(?:typescript|javascript|html|css)\r?\n/g, '')
          .replace(/```$/g, '')
          .trim();
        
        if (cleanCode) {
          codeExamples.push(cleanCode);
        }
      }
    }
    
    // Also look for <docs-code> elements which are used in newer Angular documentation
    const docsCodeRegex = /<docs-code[^>]*>([\s\S]*?)<\/docs-code>/g;
    const docsCodeBlocks = Array.from(content.matchAll(docsCodeRegex));
    
    if (docsCodeBlocks && docsCodeBlocks.length > 0) {
      for (const match of docsCodeBlocks) {
        if (match[1] && match[1].trim()) {
          codeExamples.push(match[1].trim());
        }
      }
    }
    
    // Extract code from docs-code with header and path attributes
    const docsCodeHeaderPathRegex = /<docs-code[^>]*?header=['"]([^'"]+)['"][^>]*?path=['"]([^'"]+)['"][^>]*?>/g;
    const docsCodeHeaderPathMatches = Array.from(content.matchAll(docsCodeHeaderPathRegex));
    
    if (docsCodeHeaderPathMatches && docsCodeHeaderPathMatches.length > 0) {
      for (const match of docsCodeHeaderPathMatches) {
        if (match[1] && match[2]) {
          codeExamples.push(`// Header: ${match[1]}\n// Path reference: ${match[2]}\n// Actual code would be loaded from this path`);
        }
      }
    }
    
    // Extract code from visibleRegion attributes which is common in Angular docs
    const visibleRegionRegex = /visibleRegion=['"]([^'"]+)['"]/g;
    const visibleRegionMatches = Array.from(content.matchAll(visibleRegionRegex));
    
    if (visibleRegionMatches && visibleRegionMatches.length > 0) {
      for (const match of visibleRegionMatches) {
        if (match[1]) {
          codeExamples.push(`// Visible region: ${match[1]}\n// This references a specific section of code in an example file`);
        }
      }
    }
    
    // Check for Angular-specific @if syntax in HTML examples
    // This helps identify and extract modern Angular control flow syntax
    for (let i = 0; i < codeExamples.length; i++) {
      const example = codeExamples[i];
      if (example.includes('@if') || example.includes('@for') || example.includes('@switch')) {
        // Add a special indicator for modern syntax examples
        codeExamples[i] = `// Modern Angular control flow syntax\n${example}`;
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