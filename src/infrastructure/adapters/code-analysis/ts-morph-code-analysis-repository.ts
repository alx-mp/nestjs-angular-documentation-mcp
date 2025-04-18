import { BestPractice, CodeAnalysisResult, CodeFile, CodeFileType, CodeIssue, CodeLanguage, IssueSeverity } from "@/core/domain/entities/code-analysis.js";
import { CodeAnalysisRepository } from "@/core/domain/interfaces/code-analysis-repository.js";
import { DocumentationRepository } from '@/core/domain/interfaces/documentation-repository.js';
import * as ts from 'ts-morph';


/**
 * Adapter for analyzing code files against best practices from documentation
 */
export class TsMorphCodeAnalysisRepository implements CodeAnalysisRepository {
  constructor(private readonly documentationRepository: DocumentationRepository) {}

  /**
   * Analyzes a code file for issues and best practice compliance
   */
  async analyzeFile(file: CodeFile, framework: string): Promise<CodeAnalysisResult> {
    // First, ensure we have the correct file type detected
    const detectedFile = await this.detectFileType(file);
    
    // Fetch relevant best practices from documentation
    const bestPracticeStrings = await this.fetchRelevantBestPractices(detectedFile, framework);
    
    // Convert string best practices to domain objects
    const bestPractices = bestPracticeStrings.map((practice, index) => {
      // Try to extract a title from the practice text
      const titleMatch = practice.match(/^#+\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : `Best Practice ${index + 1}`;
      
      // Try to extract a documentation URL if present in the text
      const urlMatch = practice.match(/https?:\/\/[^\s)]+/);
      const docUrl = urlMatch ? urlMatch[0] : '';
      
      // Extract code examples if present
      const codeExamples = this.extractCodeExamples(practice);
      const codeExample = codeExamples.length > 0 ? codeExamples[0] : '';
      
      return new BestPractice(
        `bp-${index + 1}`,
        title,
        practice,
        docUrl,
        codeExample
      );
    });
    
    // Analyze code for issues
    const issues = await this.findIssues(detectedFile, bestPractices, framework);
    
    return new CodeAnalysisResult(detectedFile, issues, bestPractices);
  }
  
  /**
   * Extract code examples from a text block
   */
  private extractCodeExamples(text: string): string[] {
    const codeExamples: string[] = [];
    const codeBlocks = text.match(/```(?:typescript|javascript|html)[\s\S]*?```/g);
    
    if (codeBlocks) {
      for (const block of codeBlocks) {
        // Clean up the code block by removing the markdown code fence
        const cleanCode = block
          .replace(/^```(?:typescript|javascript|html)\r?\n/g, '')
          .replace(/```$/g, '')
          .trim();
        
        codeExamples.push(cleanCode);
      }
    }
    
    return codeExamples;
  }
  
  /**
   * Analyzes multiple code files in a project
   */
  async analyzeProject(files: CodeFile[], framework: string): Promise<CodeAnalysisResult[]> {
    const results: CodeAnalysisResult[] = [];
    
    for (const file of files) {
      const result = await this.analyzeFile(file, framework);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Determines the framework and file type of a given code file
   */
  async detectFileType(file: CodeFile): Promise<CodeFile> {
    // If the file already has a detected type, return it
    if (file.getFileType() !== CodeFileType.UNKNOWN) {
      return file;
    }
    
    const path = file.getPath();
    const content = file.getContent();
    let fileType = CodeFileType.UNKNOWN;
    let language = file.getLanguage();
    
    // Detect language if not already set
    if (language === CodeLanguage.UNKNOWN) {
      if (path.endsWith('.ts')) {
        language = CodeLanguage.TYPESCRIPT;
      } else if (path.endsWith('.js')) {
        language = CodeLanguage.JAVASCRIPT;
      } else if (path.endsWith('.html')) {
        language = CodeLanguage.HTML;
      } else if (path.endsWith('.css')) {
        language = CodeLanguage.CSS;
      } else if (path.endsWith('.scss')) {
        language = CodeLanguage.SCSS;
      } else if (path.endsWith('.json')) {
        language = CodeLanguage.JSON;
      } else if (path.endsWith('.yml') || path.endsWith('.yaml')) {
        language = CodeLanguage.YAML;
      }
    }
    
    // Detect file type based on content and file name
    if (language === CodeLanguage.TYPESCRIPT || language === CodeLanguage.JAVASCRIPT) {
      // NestJS patterns - updated for current naming conventions 
      if (path.includes('.controller.')) {
        fileType = CodeFileType.NESTJS_CONTROLLER;
      } else if (path.includes('.service.') || path.includes('.provider.')) {
        fileType = CodeFileType.NESTJS_SERVICE;
      } else if (path.includes('.module.')) {
        fileType = CodeFileType.NESTJS_MODULE;
      } else if (path.includes('.middleware.')) {
        fileType = CodeFileType.NESTJS_MIDDLEWARE;
      } else if (path.includes('.pipe.')) {
        fileType = CodeFileType.NESTJS_PIPE;
      } else if (path.includes('.guard.')) {
        fileType = CodeFileType.NESTJS_GUARD;
      } else if (path.includes('.interceptor.') || path.includes('.filter.')) {
        fileType = CodeFileType.NESTJS_INTERCEPTOR;
      }
      // Angular patterns - updated for current naming conventions
      else if (path.includes('.component.') || path.match(/.*\.component$/)) {
        fileType = CodeFileType.ANGULAR_COMPONENT;
      } else if (path.includes('.service.') || path.match(/.*\.service$/)) {
        fileType = CodeFileType.ANGULAR_SERVICE;
      } else if (path.includes('.module.') || path.match(/.*\.module$/)) {
        fileType = CodeFileType.ANGULAR_MODULE;
      } else if (path.includes('.directive.') || path.match(/.*\.directive$/)) {
        fileType = CodeFileType.ANGULAR_DIRECTIVE;
      } else if (path.includes('.pipe.') || path.match(/.*\.pipe$/)) {
        fileType = CodeFileType.ANGULAR_PIPE;
      }
      // Other patterns
      else if (path.includes('.spec.') || path.includes('.test.')) {
        fileType = CodeFileType.TEST;
      } else if (
        path.includes('package.json') ||
        path.includes('tsconfig.json') ||
        path.includes('angular.json') ||
        path.includes('nest-cli.json')
      ) {
        fileType = CodeFileType.CONFIGURATION;
      }
    }
    
    // If we couldn't detect from the path, check content for specific framework patterns
    if (fileType === CodeFileType.UNKNOWN && (language === CodeLanguage.TYPESCRIPT || language === CodeLanguage.JAVASCRIPT)) {
      // NestJS patterns
      if (content.includes('@Controller') || content.includes('Controller')) {
        fileType = CodeFileType.NESTJS_CONTROLLER;
      } else if (content.includes('@Injectable') && (
        content.includes('Service') || 
        content.includes('Provider') || 
        content.includes('Repository')
      )) {
        fileType = CodeFileType.NESTJS_SERVICE;
      } else if (content.includes('@Module')) {
        fileType = CodeFileType.NESTJS_MODULE;
      } else if (content.includes('@Injectable') && content.includes('Pipe')) {
        fileType = CodeFileType.NESTJS_PIPE;
      } else if (content.includes('@Injectable') && content.includes('Guard')) {
        fileType = CodeFileType.NESTJS_GUARD;
      } else if (content.includes('@Injectable') && (
        content.includes('Interceptor') || 
        content.includes('Filter') || 
        content.includes('ExceptionFilter')
      )) {
        fileType = CodeFileType.NESTJS_INTERCEPTOR;
      }
      // Angular patterns
      else if (content.includes('@Component')) {
        fileType = CodeFileType.ANGULAR_COMPONENT;
      } else if (content.includes('@Injectable') && !content.includes('@nestjs/')) {
        fileType = CodeFileType.ANGULAR_SERVICE;
      } else if (content.includes('@NgModule')) {
        fileType = CodeFileType.ANGULAR_MODULE;
      } else if (content.includes('@Directive')) {
        fileType = CodeFileType.ANGULAR_DIRECTIVE;
      } else if (content.includes('@Pipe')) {
        fileType = CodeFileType.ANGULAR_PIPE;
      }
    }
    
    return new CodeFile(path, content, language, fileType);
  }
  
  /**
   * Generates fix suggestions for identified code issues
   */
  async generateFixSuggestions(analysisResult: CodeAnalysisResult): Promise<string[]> {
    const suggestions: string[] = [];
    const file = analysisResult.getFile();
    const issues = analysisResult.getIssues();
    
    for (const issue of issues) {
      const framework = this.getFrameworkFromFileType(file.getFileType());
      const bestPractices = await this.documentationRepository.getBestPractices(framework, issue.getDescription());
      
      let suggestion = `Issue: ${issue.getDescription()}\n`;
      suggestion += `Severity: ${issue.getSeverity()}\n`;
      suggestion += `Location: Lines ${issue.getLineStart()}-${issue.getLineEnd()}\n\n`;
      
      suggestion += `Suggested Fix:\n${issue.getSuggestedFix()}\n\n`;
      
      if (bestPractices.length > 0) {
        suggestion += `Related Best Practices:\n`;
        for (const practice of bestPractices.slice(0, 2)) { // Limit to 2 best practices
          const cleanPractice = practice
            .replace(/^#+\s+.+\n/, '') // Remove headings
            .replace(/```(?:typescript|javascript|html)[\s\S]*?```/g, '[Code example]') // Replace code blocks
            .substring(0, 200); // Limit length
          
          suggestion += `- ${cleanPractice}...\n`;
        }
      }
      
      // Add documentation links if available
      if (issue.getRelatedDocumentation()) {
        suggestion += `\nReference: ${issue.getRelatedDocumentation()}`;
      }
      
      suggestions.push(suggestion);
    }
    
    return suggestions;
  }
  
  /**
   * Fetches best practices relevant to the file being analyzed
   */
  private async fetchRelevantBestPractices(file: CodeFile, framework: string): Promise<string[]> {
    const fileType = file.getFileType();
    const component = this.getComponentNameFromFileType(fileType);
    let bestPractices: string[] = [];
    
    if (component) {
      // Try to get specific best practices for this component
      bestPractices = await this.documentationRepository.getBestPractices(framework, component);
      
      // If no specific best practices found, try some common terms
      if (bestPractices.length === 0) {
        const commonTerms = ['best practices', 'style guide', 'conventions'];
        for (const term of commonTerms) {
          const practices = await this.documentationRepository.getBestPractices(framework, term);
          if (practices.length > 0) {
            bestPractices = practices;
            break;
          }
        }
      }
    }
    
    return bestPractices;
  }
  
  /**
   * Maps file type to component name for documentation search
   */
  private getComponentNameFromFileType(fileType: CodeFileType): string {
    switch (fileType) {
      case CodeFileType.NESTJS_CONTROLLER:
        return 'controller';
      case CodeFileType.NESTJS_SERVICE:
        return 'service';
      case CodeFileType.NESTJS_MODULE:
        return 'module';
      case CodeFileType.NESTJS_MIDDLEWARE:
        return 'middleware';
      case CodeFileType.NESTJS_PIPE:
        return 'pipe';
      case CodeFileType.NESTJS_GUARD:
        return 'guard';
      case CodeFileType.NESTJS_INTERCEPTOR:
        return 'interceptor';
      case CodeFileType.ANGULAR_COMPONENT:
        return 'component';
      case CodeFileType.ANGULAR_SERVICE:
        return 'service';
      case CodeFileType.ANGULAR_MODULE:
        return 'module';
      case CodeFileType.ANGULAR_DIRECTIVE:
        return 'directive';
      case CodeFileType.ANGULAR_PIPE:
        return 'pipe';
      default:
        return '';
    }
  }
  
  /**
   * Determines framework from file type
   */
  private getFrameworkFromFileType(fileType: CodeFileType): string {
    if (fileType.toString().startsWith('ANGULAR_')) {
      return 'angular';
    } else if (fileType.toString().startsWith('NESTJS_')) {
      return 'nestjs';
    }
    return '';
  }
  
  /**
   * Analyzes code to find issues based on best practices
   */
  private async findIssues(file: CodeFile, bestPractices: BestPractice[], framework: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    const language = file.getLanguage();
    const fileType = file.getFileType();
    const content = file.getContent();
    
    // Skip non-TypeScript/JavaScript files and unknown file types
    if (
      (language !== CodeLanguage.TYPESCRIPT && language !== CodeLanguage.JAVASCRIPT) || 
      fileType === CodeFileType.UNKNOWN
    ) {
      return issues;
    }
    
    // Create a project and add the source file
    const project = new ts.Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
    });
    
    try {
      const sourceFile = project.createSourceFile(file.getPath(), content);
      
      // Common analysis for all TypeScript files
      this.analyzeCommonTypeScriptPatterns(sourceFile, issues, framework);
      
      // Use ts-morph to analyze the code based on file type
      if (fileType === CodeFileType.NESTJS_CONTROLLER) {
        this.analyzeNestJSController(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.NESTJS_SERVICE) {
        this.analyzeNestJSService(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.NESTJS_MODULE) {
        this.analyzeNestJSModule(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.NESTJS_PIPE) {
        this.analyzeNestJSPipe(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.NESTJS_GUARD) {
        this.analyzeNestJSGuard(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.NESTJS_INTERCEPTOR) {
        this.analyzeNestJSInterceptor(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.ANGULAR_COMPONENT) {
        this.analyzeAngularComponent(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.ANGULAR_SERVICE) {
        this.analyzeAngularService(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.ANGULAR_MODULE) {
        this.analyzeAngularModule(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.ANGULAR_DIRECTIVE) {
        this.analyzeAngularDirective(sourceFile, issues, bestPractices);
      } else if (fileType === CodeFileType.ANGULAR_PIPE) {
        this.analyzeAngularPipe(sourceFile, issues, bestPractices);
      }
    } catch (error) {
      console.error(`Error analyzing file ${file.getPath()}:`, error);
    }
    
    return issues;
  }
  
  /**
   * Analyzes common TypeScript patterns for any file type
   */
  private analyzeCommonTypeScriptPatterns(sourceFile: ts.SourceFile, issues: CodeIssue[], framework: string): void {
    // Check for unused imports
    const importDeclarations = sourceFile.getImportDeclarations();
    
    for (const importDecl of importDeclarations) {
      const namedImports = importDecl.getNamedImports();
      
      for (const namedImport of namedImports) {
        const identifier = namedImport.getName();
        const references = sourceFile.getDescendantsOfKind(ts.SyntaxKind.Identifier)
          .filter(id => id.getText() === identifier);
        
        // Check if identifier is only used in import declaration
        if (references.length <= 1) { // Just the import itself
          issues.push(new CodeIssue(
            `unused-import-${identifier}`,
            `Unused import: ${identifier}`,
            IssueSeverity.WARNING,
            importDecl.getStartLineNumber(),
            importDecl.getEndLineNumber(),
            `Remove the unused import: ${identifier}`,
            framework === 'angular' 
              ? 'https://angular.io/guide/styleguide#style-04-13'
              : 'https://docs.nestjs.com/styleguide'
          ));
        }
      }
    }
    
    // Check for commented out code
    const comments = sourceFile.getDescendants().filter(d => 
      d.getKind() === ts.SyntaxKind.SingleLineCommentTrivia && 
      d.getText().match(/^\s*\/\/.*[;{}]/)
    );
    
    if (comments.length > 0) {
      for (const comment of comments) {
        issues.push(new CodeIssue(
          `commented-code-${comment.getStartLineNumber()}`,
          'Commented out code should be removed',
          IssueSeverity.INFO,
          comment.getStartLineNumber(),
          comment.getEndLineNumber(),
          'Remove commented out code',
          framework === 'angular' 
            ? 'https://angular.io/guide/styleguide#style-02-03'
            : 'https://docs.nestjs.com/styleguide'
        ));
      }
    }
  }
  
  /**
   * Analyzes a NestJS controller for best practice compliance
   */
  private analyzeNestJSController(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the controller class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Controller decorator
      const hasControllerDecorator = classDeclaration.getDecorators().some(d => 
        d.getName() === 'Controller'
      );
      
      if (!hasControllerDecorator) {
        issues.push(new CodeIssue(
          `missing-controller-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Controller decorator on controller class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Controller() decorator to the class:\n\n@Controller()\n${classDeclaration.getText()}`,
          'https://docs.nestjs.com/controllers'
        ));
      }
      
      // Check handler methods for proper decorators (@Get, @Post, etc.)
      const methods = classDeclaration.getMethods();
      for (const method of methods) {
        const hasHttpMethodDecorator = method.getDecorators().some(d => 
          ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head'].includes(d.getName())
        );
        
        if (!hasHttpMethodDecorator && 
            !method.hasModifier(ts.SyntaxKind.PrivateKeyword) && 
            !method.hasModifier(ts.SyntaxKind.ProtectedKeyword)) {
          issues.push(new CodeIssue(
            `missing-http-method-decorator-${method.getName()}`,
            `Missing HTTP method decorator on controller method ${method.getName()}`,
            IssueSeverity.WARNING,
            method.getStartLineNumber(),
            method.getEndLineNumber(),
            `Add an appropriate HTTP method decorator to the method:\n\n@Get()\n${method.getText()}`,
            'https://docs.nestjs.com/controllers#request-object'
          ));
        }
      }
      
      // Check if controller has constructor with dependency injection
      const constructor = classDeclaration.getConstructors()[0];
      if (constructor) {
        // Check constructor parameter property modifiers (private/protected/public)
        const parameters = constructor.getParameters();
        for (const param of parameters) {
          if (!param.hasModifier(ts.SyntaxKind.PrivateKeyword) && 
              !param.hasModifier(ts.SyntaxKind.ProtectedKeyword) && 
              !param.hasModifier(ts.SyntaxKind.PublicKeyword)) {
            issues.push(new CodeIssue(
              `missing-access-modifier-${param.getName() || 'unknown'}`,
              `Missing access modifier in constructor parameter for dependency injection: ${param.getName() || 'unknown'}`,
              IssueSeverity.WARNING,
              param.getStartLineNumber(),
              param.getEndLineNumber(),
              `Add an access modifier (private, protected, or public) to the parameter:\n\nconstructor(private ${param.getText()}) {}`,
              'https://docs.nestjs.com/providers#dependency-injection'
            ));
          }
        }
      }
    }
  }
  
  /**
   * Analyzes a NestJS service for best practice compliance
   */
  private analyzeNestJSService(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the service class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Injectable decorator
      const hasInjectableDecorator = classDeclaration.getDecorators().some(d => 
        d.getName() === 'Injectable'
      );
      
      if (!hasInjectableDecorator) {
        issues.push(new CodeIssue(
          `missing-injectable-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Injectable decorator on service class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Injectable() decorator to the class:\n\n@Injectable()\n${classDeclaration.getText()}`,
          'https://docs.nestjs.com/providers'
        ));
      }
      
      // Check for naming convention (should end with 'Service')
      const className = classDeclaration.getName();
      if (className && !className.endsWith('Service') && !className.endsWith('Provider') && !className.endsWith('Repository')) {
        issues.push(new CodeIssue(
          `service-naming-convention-${className}`,
          `Service class name should end with 'Service': ${className}`,
          IssueSeverity.INFO,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Rename the class to follow the naming convention:\n\nexport class ${className}Service {...}`,
          'https://docs.nestjs.com/styleguide#naming'
        ));
      }
    }
  }
  
  /**
   * Analyzes a NestJS module for best practice compliance
   */
  private analyzeNestJSModule(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the module class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Module decorator
      const moduleDecorator = classDeclaration.getDecorators().find(d => 
        d.getName() === 'Module'
      );
      
      if (!moduleDecorator) {
        issues.push(new CodeIssue(
          `missing-module-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Module decorator on module class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Module decorator with required metadata to the class:\n\n@Module({\n  imports: [],\n  controllers: [],\n  providers: [],\n  exports: []\n})\n${classDeclaration.getText()}`,
          'https://docs.nestjs.com/modules'
        ));
        continue;
      }
      
      // Check for naming convention (should end with 'Module')
      const className = classDeclaration.getName();
      if (className && !className.endsWith('Module')) {
        issues.push(new CodeIssue(
          `module-naming-convention-${className}`,
          `Module class name should end with 'Module': ${className}`,
          IssueSeverity.INFO,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Rename the class to follow the naming convention:\n\nexport class ${className}Module {...}`,
          'https://docs.nestjs.com/styleguide#naming'
        ));
      }
    }
  }
  
  /**
   * Analyzes a NestJS pipe for best practice compliance
   */
  private analyzeNestJSPipe(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the pipe class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Injectable decorator
      const hasInjectableDecorator = classDeclaration.getDecorators().some(d => 
        d.getName() === 'Injectable'
      );
      
      if (!hasInjectableDecorator) {
        issues.push(new CodeIssue(
          `missing-injectable-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Injectable decorator on pipe class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Injectable() decorator to the class:\n\n@Injectable()\n${classDeclaration.getText()}`,
          'https://docs.nestjs.com/pipes'
        ));
      }
      
      // Check if class implements PipeTransform interface
      const implementsClause = classDeclaration.getImplements();
      const implementsPipeTransform = implementsClause.some(impl => 
        impl.getText().includes('PipeTransform')
      );
      
      if (!implementsPipeTransform) {
        issues.push(new CodeIssue(
          `missing-pipetransform-interface-${classDeclaration.getName() || 'unknown'}`,
          `Pipe class should implement PipeTransform interface`,
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Update class to implement PipeTransform interface:\n\nexport class ${classDeclaration.getName()} implements PipeTransform {...}`,
          'https://docs.nestjs.com/pipes'
        ));
      }
      
      // Check for transform method implementation
      const hasTransformMethod = classDeclaration.getMethods().some(method => 
        method.getName() === 'transform'
      );
      
      if (!hasTransformMethod) {
        issues.push(new CodeIssue(
          `missing-transform-method-${classDeclaration.getName() || 'unknown'}`,
          'Pipe class must implement a transform method',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add transform method to pipe class:\n\ntransform(value: any, metadata: ArgumentMetadata) {\n  // transformation logic\n  return value;\n}`,
          'https://docs.nestjs.com/pipes#building-a-simple-pipe'
        ));
      }
    }
  }
  
  /**
   * Analyzes a NestJS guard for best practice compliance
   */
  private analyzeNestJSGuard(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the guard class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Injectable decorator
      const hasInjectableDecorator = classDeclaration.getDecorators().some(d => 
        d.getName() === 'Injectable'
      );
      
      if (!hasInjectableDecorator) {
        issues.push(new CodeIssue(
          `missing-injectable-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Injectable decorator on guard class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Injectable() decorator to the class:\n\n@Injectable()\n${classDeclaration.getText()}`,
          'https://docs.nestjs.com/guards'
        ));
      }
      
      // Check if class implements CanActivate interface
      const implementsClause = classDeclaration.getImplements();
      const implementsCanActivate = implementsClause.some(impl => 
        impl.getText().includes('CanActivate')
      );
      
      if (!implementsCanActivate) {
        issues.push(new CodeIssue(
          `missing-canactivate-interface-${classDeclaration.getName() || 'unknown'}`,
          `Guard class should implement CanActivate interface`,
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Update class to implement CanActivate interface:\n\nexport class ${classDeclaration.getName()} implements CanActivate {...}`,
          'https://docs.nestjs.com/guards'
        ));
      }
      
      // Check for canActivate method implementation
      const hasCanActivateMethod = classDeclaration.getMethods().some(method => 
        method.getName() === 'canActivate'
      );
      
      if (!hasCanActivateMethod) {
        issues.push(new CodeIssue(
          `missing-canactivate-method-${classDeclaration.getName() || 'unknown'}`,
          'Guard class must implement a canActivate method',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add canActivate method to guard class:\n\ncanActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {\n  // guard logic\n  return true;\n}`,
          'https://docs.nestjs.com/guards#basic-guard'
        ));
      }
    }
  }
  
  /**
   * Analyzes a NestJS interceptor for best practice compliance
   */
  private analyzeNestJSInterceptor(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the interceptor class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Injectable decorator
      const hasInjectableDecorator = classDeclaration.getDecorators().some(d => 
        d.getName() === 'Injectable'
      );
      
      if (!hasInjectableDecorator) {
        issues.push(new CodeIssue(
          `missing-injectable-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Injectable decorator on interceptor class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Injectable() decorator to the class:\n\n@Injectable()\n${classDeclaration.getText()}`,
          'https://docs.nestjs.com/interceptors'
        ));
      }
      
      // Check interface implementation based on class name or methods
      const className = classDeclaration.getName() || '';
      
      if (className.includes('Filter') || className.includes('Exception')) {
        // Exception filter should implement ExceptionFilter
        const implementsClause = classDeclaration.getImplements();
        const implementsExceptionFilter = implementsClause.some(impl => 
          impl.getText().includes('ExceptionFilter')
        );
        
        if (!implementsExceptionFilter) {
          issues.push(new CodeIssue(
            `missing-exceptionfilter-interface-${className}`,
            `Exception filter class should implement ExceptionFilter interface`,
            IssueSeverity.ERROR,
            classDeclaration.getStartLineNumber(),
            classDeclaration.getEndLineNumber(),
            `Update class to implement ExceptionFilter interface:\n\nexport class ${className} implements ExceptionFilter {...}`,
            'https://docs.nestjs.com/exception-filters'
          ));
        }
        
        // Check for catch method
        const hasCatchMethod = classDeclaration.getMethods().some(method => 
          method.getName() === 'catch'
        );
        
        if (!hasCatchMethod) {
          issues.push(new CodeIssue(
            `missing-catch-method-${className}`,
            'Exception filter class must implement a catch method',
            IssueSeverity.ERROR,
            classDeclaration.getStartLineNumber(),
            classDeclaration.getEndLineNumber(),
            `Add catch method to exception filter class:\n\ncatch(exception: Error, host: ArgumentsHost) {\n  // filter logic\n}`,
            'https://docs.nestjs.com/exception-filters#binding-filters'
          ));
        }
      } else {
        // Interceptor should implement NestInterceptor
        const implementsClause = classDeclaration.getImplements();
        const implementsNestInterceptor = implementsClause.some(impl => 
          impl.getText().includes('NestInterceptor')
        );
        
        if (!implementsNestInterceptor) {
          issues.push(new CodeIssue(
            `missing-nestinterceptor-interface-${className}`,
            `Interceptor class should implement NestInterceptor interface`,
            IssueSeverity.ERROR,
            classDeclaration.getStartLineNumber(),
            classDeclaration.getEndLineNumber(),
            `Update class to implement NestInterceptor interface:\n\nexport class ${className} implements NestInterceptor {...}`,
            'https://docs.nestjs.com/interceptors'
          ));
        }
        
        // Check for intercept method
        const hasInterceptMethod = classDeclaration.getMethods().some(method => 
          method.getName() === 'intercept'
        );
        
        if (!hasInterceptMethod) {
          issues.push(new CodeIssue(
            `missing-intercept-method-${className}`,
            'Interceptor class must implement an intercept method',
            IssueSeverity.ERROR,
            classDeclaration.getStartLineNumber(),
            classDeclaration.getEndLineNumber(),
            `Add intercept method to interceptor class:\n\nintercept(context: ExecutionContext, next: CallHandler): Observable<any> {\n  // interceptor logic\n  return next.handle();\n}`,
            'https://docs.nestjs.com/interceptors#basics'
          ));
        }
      }
    }
  }
  
  /**
   * Analyzes an Angular component for best practice compliance
   */
  private analyzeAngularComponent(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the component class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Component decorator
      const componentDecorator = classDeclaration.getDecorators().find(d => 
        d.getName() === 'Component'
      );
      
      if (!componentDecorator) {
        issues.push(new CodeIssue(
          `missing-component-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Component decorator on component class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Component() decorator with required metadata to the class:\n\n@Component({\n  selector: 'app-${classDeclaration.getName()?.toLowerCase() || 'example'}',\n  templateUrl: './${classDeclaration.getName()?.toLowerCase() || 'example'}.component.html'\n})\n${classDeclaration.getText()}`,
          'https://angular.io/api/core/Component'
        ));
        continue;
      }
      
      // Check for OnInit implementation if ngOnInit is present
      const implementsOnInit = classDeclaration.getImplements().some(i => 
        i.getText().includes('OnInit')
      );
      
      const hasNgOnInitMethod = classDeclaration.getMethods().some(m => 
        m.getName() === 'ngOnInit'
      );
      
      if (hasNgOnInitMethod && !implementsOnInit) {
        issues.push(new CodeIssue(
          `missing-oninit-interface-${classDeclaration.getName() || 'unknown'}`,
          'Component has ngOnInit method but does not implement OnInit interface',
          IssueSeverity.WARNING,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getStartLineNumber() + 1,
          `Update class declaration to implement OnInit:\n\nexport class ${classDeclaration.getName()} implements OnInit {\n\n  // Don't forget to add the import:\n  // import { OnInit } from '@angular/core';`,
          'https://angular.io/api/core/OnInit'
        ));
      }
    }
  }
  
  /**
   * Analyzes an Angular service for best practice compliance
   */
  private analyzeAngularService(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the service class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Injectable decorator
      const hasInjectableDecorator = classDeclaration.getDecorators().some(d => 
        d.getName() === 'Injectable'
      );
      
      if (!hasInjectableDecorator) {
        issues.push(new CodeIssue(
          `missing-injectable-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Injectable decorator on service class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Injectable() decorator to the class:\n\n@Injectable({ providedIn: 'root' })\n${classDeclaration.getText()}\n\n// Don't forget to add the import:\n// import { Injectable } from '@angular/core';`,
          'https://angular.io/guide/dependency-injection'
        ));
      } else {
        // Check for providedIn property
        const injectableDecorator = classDeclaration.getDecorators().find(d => 
          d.getName() === 'Injectable'
        );
        
        if (injectableDecorator) {
          const decoratorArgs = injectableDecorator.getArguments()[0];
          if (!decoratorArgs || !decoratorArgs.getText().includes('providedIn')) {
            issues.push(new CodeIssue(
              `missing-providedin-${classDeclaration.getName() || 'unknown'}`,
              'Injectable decorator should use providedIn for tree-shakable services',
              IssueSeverity.WARNING,
              injectableDecorator.getStartLineNumber(),
              injectableDecorator.getEndLineNumber(),
              `Update Injectable decorator to use providedIn:\n\n@Injectable({ providedIn: 'root' })`,
              'https://angular.io/guide/dependency-injection-providers#tree-shakable-providers'
            ));
          }
        }
      }
    }
  }
  
  /**
   * Analyzes an Angular module for best practice compliance
   */
  private analyzeAngularModule(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the module class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @NgModule decorator
      const ngModuleDecorator = classDeclaration.getDecorators().find(d => 
        d.getName() === 'NgModule'
      );
      
      if (!ngModuleDecorator) {
        issues.push(new CodeIssue(
          `missing-ngmodule-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @NgModule decorator on module class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @NgModule decorator with required metadata to the class:\n\n@NgModule({\n  declarations: [],\n  imports: [],\n  exports: [],\n  providers: []\n})\n${classDeclaration.getText()}\n\n// Don't forget to add the import:\n// import { NgModule } from '@angular/core';`,
          'https://angular.io/guide/ngmodules'
        ));
      }
    }
  }
  
  /**
   * Analyzes an Angular directive for best practice compliance
   */
  private analyzeAngularDirective(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the directive class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Directive decorator
      const directiveDecorator = classDeclaration.getDecorators().find(d => 
        d.getName() === 'Directive'
      );
      
      if (!directiveDecorator) {
        issues.push(new CodeIssue(
          `missing-directive-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Directive decorator on directive class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Directive decorator with required metadata to the class:\n\n@Directive({\n  selector: '[app${classDeclaration.getName() || 'Example'}]'\n})\n${classDeclaration.getText()}\n\n// Don't forget to add the import:\n// import { Directive } from '@angular/core';`,
          'https://angular.io/guide/attribute-directives'
        ));
      }
    }
  }
  
  /**
   * Analyzes an Angular pipe for best practice compliance
   */
  private analyzeAngularPipe(sourceFile: ts.SourceFile, issues: CodeIssue[], bestPractices: BestPractice[]): void {
    // Find the pipe class
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      // Check for @Pipe decorator
      const pipeDecorator = classDeclaration.getDecorators().find(d => 
        d.getName() === 'Pipe'
      );
      
      if (!pipeDecorator) {
        issues.push(new CodeIssue(
          `missing-pipe-decorator-${classDeclaration.getName() || 'unknown'}`,
          'Missing @Pipe decorator on pipe class',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Add @Pipe decorator with required metadata to the class:\n\n@Pipe({\n  name: '${classDeclaration.getName()?.toLowerCase() || 'example'}'\n})\n${classDeclaration.getText()}\n\n// Don't forget to add the import:\n// import { Pipe, PipeTransform } from '@angular/core';`,
          'https://angular.io/guide/pipes'
        ));
      }
      
      // Check if class implements PipeTransform
      const implementsClause = classDeclaration.getImplements();
      const implementsPipeTransform = implementsClause.some(impl => 
        impl.getText().includes('PipeTransform')
      );
      
      if (!implementsPipeTransform) {
        issues.push(new CodeIssue(
          `missing-pipetransform-interface-${classDeclaration.getName() || 'unknown'}`,
          'Pipe class should implement PipeTransform interface',
          IssueSeverity.ERROR,
          classDeclaration.getStartLineNumber(),
          classDeclaration.getEndLineNumber(),
          `Update class declaration to implement PipeTransform:\n\nexport class ${classDeclaration.getName()} implements PipeTransform {...}\n\n// Don't forget to add the import:\n// import { Pipe, PipeTransform } from '@angular/core';`,
          'https://angular.io/guide/pipes#creating-pipes-for-custom-data-transformations'
        ));
      }
    }
  }
}