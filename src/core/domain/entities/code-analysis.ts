/**
 * Represents a code file within a project being analyzed
 */
export class CodeFile {
  constructor(
    private readonly path: string,
    private readonly content: string,
    private readonly language: CodeLanguage,
    private readonly fileType: CodeFileType
  ) {}

  getPath(): string {
    return this.path;
  }

  getContent(): string {
    return this.content;
  }

  getLanguage(): CodeLanguage {
    return this.language;
  }

  getFileType(): CodeFileType {
    return this.fileType;
  }
}

/**
 * Represents the result of a code analysis with recommendations
 */
export class CodeAnalysisResult {
  constructor(
    private readonly file: CodeFile,
    private readonly issues: CodeIssue[],
    private readonly bestPractices: BestPractice[]
  ) {}

  getFile(): CodeFile {
    return this.file;
  }

  getIssues(): CodeIssue[] {
    return [...this.issues];
  }

  getBestPractices(): BestPractice[] {
    return [...this.bestPractices];
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  /**
   * Generates concrete recommendations for fixing issues
   */
  generateRecommendations(): Recommendation[] {
    return this.issues.map(issue => new Recommendation(
      issue.getId(),
      `Fix for: ${issue.getDescription()}`,
      issue.getSuggestedFix(),
      issue.getRelatedDocumentation()
    ));
  }
}

/**
 * Represents an issue discovered in code during analysis
 */
export class CodeIssue {
  constructor(
    private readonly id: string,
    private readonly description: string,
    private readonly severity: IssueSeverity,
    private readonly lineStart: number,
    private readonly lineEnd: number,
    private readonly suggestedFix: string,
    private readonly relatedDocumentation: string
  ) {}

  getId(): string {
    return this.id;
  }

  getDescription(): string {
    return this.description;
  }

  getSeverity(): IssueSeverity {
    return this.severity;
  }

  getLineStart(): number {
    return this.lineStart;
  }

  getLineEnd(): number {
    return this.lineEnd;
  }

  getSuggestedFix(): string {
    return this.suggestedFix;
  }

  getRelatedDocumentation(): string {
    return this.relatedDocumentation;
  }
}

/**
 * Represents a recommendation for improving code
 */
export class Recommendation {
  constructor(
    private readonly id: string,
    private readonly title: string,
    private readonly codeChange: string,
    private readonly documentationReference: string
  ) {}

  getId(): string {
    return this.id;
  }

  getTitle(): string {
    return this.title;
  }

  getCodeChange(): string {
    return this.codeChange;
  }

  getDocumentationReference(): string {
    return this.documentationReference;
  }
}

/**
 * Represents a coding best practice from official documentation
 */
export class BestPractice {
  constructor(
    private readonly id: string,
    private readonly title: string,
    private readonly description: string,
    private readonly documentationUrl: string,
    private readonly codeExample: string
  ) {}

  getId(): string {
    return this.id;
  }

  getTitle(): string {
    return this.title;
  }

  getDescription(): string {
    return this.description;
  }

  getDocumentationUrl(): string {
    return this.documentationUrl;
  }

  getCodeExample(): string {
    return this.codeExample;
  }
}

/**
 * Enum for code file languages
 */
export enum CodeLanguage {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  HTML = 'html',
  CSS = 'css',
  SCSS = 'scss',
  JSON = 'json',
  YAML = 'yaml',
  UNKNOWN = 'unknown'
}

/**
 * Enum for code file types
 */
export enum CodeFileType {
  ANGULAR_COMPONENT = 'angular_component',
  ANGULAR_SERVICE = 'angular_service',
  ANGULAR_MODULE = 'angular_module',
  ANGULAR_DIRECTIVE = 'angular_directive',
  ANGULAR_PIPE = 'angular_pipe',
  NESTJS_CONTROLLER = 'nestjs_controller',
  NESTJS_SERVICE = 'nestjs_service',
  NESTJS_MODULE = 'nestjs_module',
  NESTJS_MIDDLEWARE = 'nestjs_middleware',
  NESTJS_PIPE = 'nestjs_pipe',
  NESTJS_GUARD = 'nestjs_guard',
  NESTJS_INTERCEPTOR = 'nestjs_interceptor',
  CONFIGURATION = 'configuration',
  TEST = 'test',
  UNKNOWN = 'unknown'
}

/**
 * Enum for issue severity levels
 */
export enum IssueSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}