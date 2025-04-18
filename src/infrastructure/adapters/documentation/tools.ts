import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { WebDocumentationRepository } from "./web-documentation-repository.js";
import { DocumentationTopic } from "@/core/domain/entities/documentation.js";

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

  // Tool to extract Angular form validation documentation with modern syntax support
  server.tool("extractAngularFormValidation", "Extract Angular form validation documentation with modern syntax support", {
    mode: z.enum(['complete', 'html', 'typescript']).optional().describe("Mode to extract: complete, html or typescript examples")
  },
  async ({ mode = 'complete' }) => {
    try {
      // Get the documentation sources
      const sources = await documentationRepository.getDocumentationSources('angular');
      if (sources.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ status: "error", message: "No Angular documentation sources found" }, null, 2) 
          }]
        };
      }

      const sourceToUse = sources[0];
      const formValidationFileName = "form-validation.md";
      
      // Buscar directamente el archivo form-validation.md
      let validationTopic = null;
      
      // Buscar en todas las secciones
      for (const section of sourceToUse.getSections()) {
        for (const topic of section.getTopics()) {
          // Comprobar si la URL del tema contiene form-validation.md
          if (topic.getUrl().toLowerCase().includes(formValidationFileName)) {
            // Asegurar que el tema tiene contenido
            validationTopic = await documentationRepository.getTopicById(sourceToUse.getId(), topic.getId());
            break;
          }
        }
        if (validationTopic) break;
      }
      
      // Si no se encuentra, intentar buscando por título como fallback
      if (!validationTopic) {
        for (const section of sourceToUse.getSections()) {
          for (const topic of section.getTopics()) {
            if (topic.getTitle().toLowerCase().includes('validación de formularios') || 
                topic.getTitle().toLowerCase().includes('form validation')) {
              validationTopic = await documentationRepository.getTopicById(sourceToUse.getId(), topic.getId());
              break;
            }
          }
          if (validationTopic) break;
        }
      }

      if (!validationTopic) {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ status: "error", message: "Form validation documentation not found" }, null, 2) 
          }]
        };
      }

      // Extract content based on mode
      if (mode === 'html') {
        // Extract HTML examples with modern @if syntax
        const examples = validationTopic.getCodeExamples()
          .filter(ex => ex.includes('@if') || (ex.includes('<') && ex.includes('>')))
          .map(ex => ({ 
            content: ex,
            usesModernSyntax: ex.includes('@if') || ex.includes('@for') || ex.includes('@switch')
          }));
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "success", 
              examples,
              count: examples.length
            }, null, 2) 
          }]
        };
      } else if (mode === 'typescript') {
        // Extract TypeScript examples
        const examples = validationTopic.getCodeExamples()
          .filter(ex => ex.includes('import') || ex.includes('class') || ex.includes('function'))
          .map(ex => ({ 
            content: ex,
            type: ex.includes('Validator') ? 'validator' : 
                 ex.includes('@Component') ? 'component' : 'other'
          }));
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "success", 
              examples,
              count: examples.length
            }, null, 2) 
          }]
        };
      } else {
        // Return full topic with processed sections
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "success", 
              topic: {
                title: validationTopic.getTitle(),
                url: validationTopic.getUrl(),
                content: validationTopic.getContent(),
                codeExamples: validationTopic.getCodeExamples().map(ex => ({
                  content: ex,
                  usesModernSyntax: ex.includes('@if') || ex.includes('@for') || ex.includes('@switch')
                }))
              }
            }, null, 2) 
          }]
        };
      }
    } catch (error) {
      console.error("Error extracting Angular form validation:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            status: "error", 
            message: `Error extracting documentation: ${errorMessage}` 
          }, null, 2) 
        }]
      };
    }
  });

  // Nueva herramienta para extraer documentación general de Angular
  server.tool("extractAngularDocumentation", "Extrae documentación detallada de Angular de cualquier tema", {
    topicSearch: z.string().describe("Término de búsqueda para encontrar el tema (ruta parcial, nombre de archivo o título)"),
    mode: z.enum(['complete', 'html', 'typescript']).optional().describe("Modo de extracción: completo, solo HTML o solo TypeScript"),
    language: z.string().optional().describe("Idioma preferido para la documentación (si está disponible)")
  },
  async ({ topicSearch, mode = 'complete', language = 'en' }) => {
    try {
      // Determinar automáticamente el framework basado en la consulta
      let framework = 'angular'; // Valor predeterminado
      const normalizedSearch = topicSearch.toLowerCase();
      
      // Palabras clave que indican que podría ser NestJS
      const nestjsKeywords = ['nest', 'controller', 'module', 'nestjs', 'gateway', 'interceptor', 'middleware', 'pipe', 'filter', 'guard'];
      // Palabras clave que indican que podría ser Angular
      const angularKeywords = ['angular', 'component', 'service', 'directive', 'pipe', 'module', 'template', 'reactive', 'form', 'router'];
      
      // Contar coincidencias para cada framework
      const nestjsMatches = nestjsKeywords.filter(keyword => normalizedSearch.includes(keyword)).length;
      const angularMatches = angularKeywords.filter(keyword => normalizedSearch.includes(keyword)).length;
      
      // Decidir el framework basado en las coincidencias
      if (nestjsMatches > angularMatches) {
        framework = 'nestjs';
      }
      
      console.log(`Framework detectado automáticamente: ${framework} para búsqueda: "${topicSearch}"`);
      
      // Obtener las fuentes de documentación para el framework detectado
      const sources = await documentationRepository.getDocumentationSources(framework);
      if (sources.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "error", 
              message: `No se encontraron fuentes de documentación para ${framework}` 
            }, null, 2) 
          }]
        };
      }

      const sourceToUse = sources[0];
      
      // Indexar todas las secciones y temas para búsqueda exhaustiva
      const allTopics = [];
      
      // Recorrer todas las secciones y temas
      for (const section of sourceToUse.getSections()) {
        for (const topic of section.getTopics()) {
          try {
            // Intentar cargar el contenido completo del tema para indexación
            const fullTopic = await documentationRepository.getTopicById(sourceToUse.getId(), topic.getId());
            if (fullTopic) {
              allTopics.push(fullTopic);
            }
          } catch (error) {
            console.error(`Error cargando tema ${topic.getTitle()}:`, error);
            // Si falla, añadir el tema sin contenido completo
            allTopics.push(topic);
          }
        }
      }
      
      console.log(`Total de temas indexados para ${framework}: ${allTopics.length}`);
      
      // Buscar en varios niveles, ordenando por relevancia
      const matchingTopics: typeof allTopics = [];
      
      // 1. Coincidencia exacta por URL/ruta de archivo
      const exactFileMatches = allTopics.filter(topic => 
        topic.getUrl().toLowerCase().includes(`/${normalizedSearch}`) ||
        topic.getUrl().toLowerCase().includes(`/${normalizedSearch}.md`)
      );
      
      if (exactFileMatches.length > 0) {
        matchingTopics.push(...exactFileMatches);
      }
      
      // 2. Coincidencia por título
      if (matchingTopics.length === 0 || matchingTopics.length < 3) {
        const titleMatches = allTopics.filter(topic => 
          topic.getTitle().toLowerCase().includes(normalizedSearch) &&
          !matchingTopics.some(t => t.getId() === topic.getId())
        );
        
        if (titleMatches.length > 0) {
          matchingTopics.push(...titleMatches);
        }
      }
      
      // 3. Búsqueda en el contenido
      if (matchingTopics.length === 0 || matchingTopics.length < 3) {
        const contentMatches = allTopics.filter(topic => {
          // Solo buscar en el contenido si está disponible
          if (!topic.getContent()) return false;
          
          // Buscar en el contenido
          const contentMatch = topic.getContent().toLowerCase().includes(normalizedSearch);
          
          // Evitar duplicados
          return contentMatch && !matchingTopics.some(t => t.getId() === topic.getId());
        });
        
        if (contentMatches.length > 0) {
          matchingTopics.push(...contentMatches.slice(0, 5)); // Limitar a 5 resultados de contenido
        }
      }
      
      // 4. Búsqueda más flexible basada en términos
      if (matchingTopics.length === 0) {
        // Dividir la búsqueda en términos
        const searchTerms = normalizedSearch
          .split(/[\s-_,.]+/)
          .filter(term => term.length > 3); // Solo términos significativos
        
        if (searchTerms.length > 0) {
          const termMatches = allTopics.filter(topic => {
            if (!topic.getContent()) return false;
            
            // Contar cuántos términos coinciden en el contenido
            const matchCount = searchTerms.filter(term => 
              topic.getContent().toLowerCase().includes(term)
            ).length;
            
            // Considerar una coincidencia si más de la mitad de los términos están presentes
            return matchCount > Math.floor(searchTerms.length / 2);
          });
          
          if (termMatches.length > 0) {
            matchingTopics.push(...termMatches);
          }
        }
      }

      // Si no hay coincidencias, devolver error
      if (matchingTopics.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "error", 
              message: `No se encontró documentación de ${framework} que coincida con: "${topicSearch}". Intenta con otro término.` 
            }, null, 2) 
          }]
        };
      }

      // Aplicar filtro de idioma si es necesario
      let topicsToUse = matchingTopics;
      if (language !== 'en') {
        // Buscar preferentemente temas en el idioma especificado
        const languageFiltered = matchingTopics.filter(topic => 
          topic.getUrl().toLowerCase().includes(`/${language}/`) || 
          (topic.getContent() && (
            topic.getContent().toLowerCase().includes(`lang="${language}"`) ||
            topic.getContent().toLowerCase().includes(`idioma="${language}"`)
          ))
        );
        
        if (languageFiltered.length > 0) {
          topicsToUse = languageFiltered;
        }
      }

      // Asegurar que se cargan todos los contenidos
      for (let i = 0; i < topicsToUse.length; i++) {
        if (!topicsToUse[i].getContent()) {
          try {
            const fullTopic = await documentationRepository.getTopicById(sourceToUse.getId(), topicsToUse[i].getId());
            if (fullTopic) {
              topicsToUse[i] = fullTopic;
            }
          } catch (error) {
            console.error(`Error cargando contenido completo para tema ${topicsToUse[i].getTitle()}:`, error);
          }
        }
      }

      // Extraer ejemplos de código de docs-code tags
      for (let i = 0; i < topicsToUse.length; i++) {
        if (topicsToUse[i].getContent()) {
          try {
            const content = topicsToUse[i].getContent();
            
            // Buscar etiquetas docs-code en el contenido
            const docsCodeRegex = /<docs-code[^>]*path=['"]([^'"]+)['"][^>]*(?:visibleRegion=['"]([^'"]+)['"])?[^>]*>/g;
            const docsCodeMatches = Array.from(content.matchAll(docsCodeRegex));
            
            if (docsCodeMatches.length > 0) {
              const extractedExamples = [];
              
              for (const match of docsCodeMatches) {
                const path = match[1];
                const region = match[2];
                
                if (path) {
                  try {
                    const code = await documentationRepository.extractCodeFromDocumentationPath(path, region);
                    if (code && !code.startsWith('// Error')) {
                      extractedExamples.push({
                        path,
                        region,
                        code
                      });
                    }
                  } catch (extractError) {
                    console.error(`Error extrayendo código de ${path}:`, extractError);
                  }
                }
              }
              
              // Añadir los ejemplos extraídos al tema
              if (extractedExamples.length > 0) {
                topicsToUse[i] = new DocumentationTopic(
                  topicsToUse[i].getId(),
                  topicsToUse[i].getTitle(),
                  topicsToUse[i].getUrl(),
                  topicsToUse[i].getContent(),
                  topicsToUse[i].getBestPractices(),
                  [
                    ...topicsToUse[i].getCodeExamples(),
                    ...extractedExamples.map(ex => ex.code)
                  ]
                );
              }
            }
          } catch (error) {
            console.error(`Error procesando ejemplos de código en tema ${topicsToUse[i].getTitle()}:`, error);
          }
        }
      }

      // Procesar según el modo seleccionado
      if (mode === 'html') {
        // Extraer ejemplos de HTML
        const htmlExamples = topicsToUse.flatMap(topic => {
          const examples = topic.getCodeExamples()
            .filter(ex => ex.includes('<') && ex.includes('>') && !ex.includes('import '))
            .map(ex => ({ 
              title: topic.getTitle(),
              content: ex,
              usesModernSyntax: ex.includes('@if') || ex.includes('@for') || ex.includes('@switch'),
              url: topic.getUrl()
            }));
          
          return examples;
        });
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "success", 
              framework,
              search: topicSearch,
              language: language,
              examples: htmlExamples,
              count: htmlExamples.length
            }, null, 2) 
          }]
        };
      } else if (mode === 'typescript') {
        // Extraer ejemplos de TypeScript
        const tsExamples = topicsToUse.flatMap(topic => {
          const examples = topic.getCodeExamples()
            .filter(ex => ex.includes('import') || ex.includes('class') || ex.includes('function') || ex.includes('interface'))
            .map(ex => ({ 
              title: topic.getTitle(),
              content: ex,
              url: topic.getUrl()
            }));
          
          return examples;
        });
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "success", 
              framework,
              search: topicSearch,
              language: language,
              examples: tsExamples,
              count: tsExamples.length
            }, null, 2) 
          }]
        };
      } else {
        // Devolver temas completos con metadatos adicionales
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "success", 
              framework,
              search: topicSearch,
              language: language,
              topics: topicsToUse.map(topic => ({
                title: topic.getTitle(),
                url: topic.getUrl(),
                content: topic.getContent(),
                codeExamples: topic.getCodeExamples().map(ex => ({
                  content: ex,
                  isHtml: ex.includes('<') && ex.includes('>') && !ex.includes('import '),
                  isTypeScript: ex.includes('import') || ex.includes('class') || ex.includes('function'),
                  usesModernSyntax: ex.includes('@if') || ex.includes('@for') || ex.includes('@switch')
                })),
                bestPractices: topic.getBestPractices(),
                foundVia: normalizedSearch.includes(topic.getUrl().toLowerCase()) ? 'url' :
                           topic.getTitle().toLowerCase().includes(normalizedSearch) ? 'title' : 'content'
              })),
              count: topicsToUse.length
            }, null, 2) 
          }]
        };
      }
    } catch (error) {
      console.error("Error extrayendo documentación:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            status: "error", 
            message: `Error al extraer la documentación: ${errorMessage}` 
          }, null, 2) 
        }]
      };
    }
  });

  // Nueva herramienta para extraer ejemplos de código específicos desde la documentación de Angular
  server.tool("extractAngularCodeSnippet", "Extrae ejemplos de código desde la documentación de Angular usando un selector <docs-code>", {
    selector: z.string().describe("Selector completo o parcial como '<docs-code path=\"...\" visibleRegion=\"...\"/>'"),
    pathOnly: z.string().optional().describe("Ruta del archivo en el repositorio de Angular (alternativa a selector)"),
    visibleRegion: z.string().optional().describe("Región visible a extraer (se usa con pathOnly)")
  },
  async ({ selector, pathOnly, visibleRegion }) => {
    try {
      // Determinar si usamos un selector completo o componentes individuales
      let code = '';
      
      if (selector && selector.includes('<docs-code')) {
        // Extraer código desde un selector docs-code completo
        code = await documentationRepository.extractDocsCodeExample(selector);
      } else if (pathOnly) {
        // Extraer código desde una ruta y región (opcional)
        code = await documentationRepository.extractCodeFromDocumentationPath(pathOnly, visibleRegion);
      } else {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "error", 
              message: "Debes proporcionar un selector docs-code completo o una ruta de archivo"
            }, null, 2) 
          }]
        };
      }
      
      // Si no se encontró código
      if (!code || code.startsWith('// Error')) {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "error", 
              message: "No se pudo extraer el código. El archivo o región puede no existir.",
              details: code
            }, null, 2) 
          }]
        };
      }
      
      // Determinar tipo de código basado en extensión o contenido
      let codeType = 'unknown';
      if (pathOnly) {
        if (pathOnly.endsWith('.html')) codeType = 'html';
        else if (pathOnly.endsWith('.ts')) codeType = 'typescript';
        else if (pathOnly.endsWith('.js')) codeType = 'javascript';
        else if (pathOnly.endsWith('.css')) codeType = 'css';
      } else {
        // Inferir del contenido
        if (code.includes('<') && code.includes('>')) codeType = 'html';
        else if (code.includes('import') || code.includes('class') || code.includes('interface')) codeType = 'typescript';
      }
      
      // Determinar si usa sintaxis moderna de Angular
      const usesModernSyntax = code.includes('@if') || code.includes('@for') || code.includes('@switch');
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            status: "success", 
            codeType,
            usesModernSyntax,
            code,
            lines: code.split('\n').length
          }, null, 2) 
        }]
      };
    } catch (error) {
      console.error("Error extrayendo ejemplo de código:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            status: "error", 
            message: `Error extrayendo ejemplo de código: ${errorMessage}` 
          }, null, 2) 
        }]
      };
    }
  });

  // Extrae documentación basada en múltiples selectores de una vez
  server.tool("extractMultipleCodeSnippets", "Extrae múltiples ejemplos de código desde la documentación de Angular basado en una lista de selectores", {
    selectors: z.array(z.object({
      selector: z.string().optional().describe("Selector completo o parcial como '<docs-code path=\"...\" visibleRegion=\"...\"/>'"),
      path: z.string().optional().describe("Ruta del archivo en el repositorio de Angular"),
      visibleRegion: z.string().optional().describe("Región visible a extraer"),
      description: z.string().optional().describe("Descripción opcional del fragmento")
    })).describe("Lista de selectores para extraer"),
    batchSize: z.number().optional().describe("Número de extracciones a realizar en paralelo (default: 5)")
  },
  async ({ selectors, batchSize = 5 }) => {
    try {
      if (!selectors || selectors.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "error", 
              message: "Debes proporcionar al menos un selector para extraer código" 
            }, null, 2) 
          }]
        };
      }

      // Procesar selectores en lotes para evitar demasiadas peticiones simultáneas
      const results = [];
      for (let i = 0; i < selectors.length; i += batchSize) {
        const batch = selectors.slice(i, i + batchSize);
        const batchPromises = batch.map(async (selectorInfo) => {
          let code = '';
          
          // Determinar el método de extracción basado en los parámetros proporcionados
          if (selectorInfo.selector && selectorInfo.selector.includes('<docs-code')) {
            code = await documentationRepository.extractDocsCodeExample(selectorInfo.selector);
          } else if (selectorInfo.path) {
            code = await documentationRepository.extractCodeFromDocumentationPath(selectorInfo.path, selectorInfo.visibleRegion);
          } else {
            return {
              error: "Configuración incompleta: se requiere 'selector' o 'path'",
              description: selectorInfo.description || "Desconocido"
            };
          }
          
          // Determinar tipo de código basado en extensión o contenido
          let codeType = 'unknown';
          if (selectorInfo.path) {
            if (selectorInfo.path.endsWith('.html')) codeType = 'html';
            else if (selectorInfo.path.endsWith('.ts')) codeType = 'typescript';
            else if (selectorInfo.path.endsWith('.js')) codeType = 'javascript';
            else if (selectorInfo.path.endsWith('.css')) codeType = 'css';
            else if (selectorInfo.path.endsWith('.scss')) codeType = 'scss';
          } else {
            // Inferir del contenido
            if (code.includes('<') && code.includes('>') && !code.includes('import ')) codeType = 'html';
            else if (code.includes('import') || code.includes('class') || code.includes('interface')) codeType = 'typescript';
          }
          
          return {
            description: selectorInfo.description || (selectorInfo.visibleRegion || "Fragmento de código"),
            path: selectorInfo.path || "",
            visibleRegion: selectorInfo.visibleRegion || "",
            codeType,
            usesModernSyntax: code.includes('@if') || code.includes('@for') || code.includes('@switch'),
            code,
            error: code.startsWith('// Error') ? code : null
          };
        });
        
        // Esperar a que termine este lote antes de continuar con el siguiente
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      
      // Agrupar resultados por tipo de código
      const groupedResults = {
        html: results.filter(r => r.codeType === 'html'),
        typescript: results.filter(r => r.codeType === 'typescript' || r.codeType === 'javascript'),
        css: results.filter(r => r.codeType === 'css' || r.codeType === 'scss'),
        other: results.filter(r => r.codeType && !['html', 'typescript', 'javascript', 'css', 'scss'].includes(r.codeType))
      };
      
      // Contar éxitos y fallos
      const successCount = results.filter(r => !r.error).length;
      const failureCount = results.filter(r => r.error).length;
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            status: "success", 
            summary: {
              totalRequested: selectors.length,
              successful: successCount,
              failed: failureCount
            },
            groupedByType: groupedResults,
            allResults: results
          }, null, 2) 
        }]
      };
    } catch (error) {
      console.error("Error extrayendo múltiples fragmentos de código:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            status: "error", 
            message: `Error extrayendo múltiples fragmentos de código: ${errorMessage}` 
          }, null, 2) 
        }]
      };
    }
  });
}