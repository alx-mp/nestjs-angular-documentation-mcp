/**
 * Represents a documentation source for frameworks like NestJS and Angular
 */
export class DocumentationSource {
  constructor(
    private readonly id: string,
    private readonly name: string,
    private readonly baseUrl: string,
    private readonly version: string,
    private readonly sections: DocumentationSection[]
  ) {}

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getVersion(): string {
    return this.version;
  }

  getSections(): DocumentationSection[] {
    return [...this.sections];
  }

  addSection(section: DocumentationSection): void {
    this.sections.push(section);
  }
}

/**
 * Represents a section of documentation with related topics
 */
export class DocumentationSection {
  constructor(
    private readonly id: string,
    private readonly title: string,
    private readonly url: string,
    private readonly topics: DocumentationTopic[] = []
  ) {}

  getId(): string {
    return this.id;
  }

  getTitle(): string {
    return this.title;
  }

  getUrl(): string {
    return this.url;
  }

  getTopics(): DocumentationTopic[] {
    return [...this.topics];
  }

  addTopic(topic: DocumentationTopic): void {
    this.topics.push(topic);
  }
}

/**
 * Represents a specific documentation topic with content and best practices
 */
export class DocumentationTopic {
  constructor(
    private readonly id: string,
    private readonly title: string,
    private readonly url: string,
    private readonly content: string,
    private readonly bestPractices: string[] = [],
    private readonly codeExamples: string[] = []
  ) {}

  getId(): string {
    return this.id;
  }

  getTitle(): string {
    return this.title;
  }

  getUrl(): string {
    return this.url;
  }

  getContent(): string {
    return this.content;
  }

  getBestPractices(): string[] {
    return [...this.bestPractices];
  }

  getCodeExamples(): string[] {
    return [...this.codeExamples];
  }

  addBestPractice(practice: string): void {
    this.bestPractices.push(practice);
  }

  addCodeExample(example: string): void {
    this.codeExamples.push(example);
  }
}