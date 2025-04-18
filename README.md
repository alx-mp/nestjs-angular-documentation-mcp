# NestJS & Angular Documentation MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) service that analyzes NestJS and Angular codebases and provides best practice recommendations based on official documentation.

## Features

- **Documentation Search**: Search through Angular and NestJS documentation from official GitHub repositories
- **Best Practices Analysis**: Get best practices for specific components or patterns
- **Code Analysis**: Analyze your Angular or NestJS code files for issues and recommendation fixes
- **Framework Detection**: Automatically detect the framework and file type of your code

## How It Works

This service connects to the official GitHub repositories of Angular and NestJS documentation:

- NestJS: <https://github.com/nestjs/docs.nestjs.com/tree/master/content>
- Angular: <https://github.com/angular/angular/tree/main/adev/src/content/guide>

It then analyzes your code and provides suggestions based on best practices found in these documentation sources.

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 10.0.0 (recommended)

## Installation

```bash
# Clone the repository
git clone https://github.com/alx-mp/nestjs-angular-doc-mcp.git
cd nestjs-angular-doc-mcp

# Install dependencies
pnpm install

# Build the project
pnpm run build
```

## Usage

You can use this MCP service with any MCP-compatible client, including:

- GitHub Copilot Chat
- Anthropic Claude
- Other MCP clients

### Running the MCP Server

```bash
pnpm run start
```

### Integration with VS Code and GitHub Copilot

Add the following configuration to your VS Code `settings.json`:

```json
"mcp.servers": {
    "angular-nestjs-docs": {
      "command": "npx",
          "args": [
      "-y",
      "tsx",
      "--tsconfig",
      "C:/[YOUR-ROUTE]/mcp_documentation_angular_nestjs/tsconfig.json",
      "C:/[YOUR-ROUTE]/mcp_documentation_angular_nestjs/src/index.ts"
    ]
  }
}
```

### Local Development

To run the MCP server locally:

```bash
# Start the MCP server in development mode
pnpm dev
```

## Available Tools

### Documentation Tools

- `searchDocumentation`: Search for best practices and guidelines
- `getBestPractices`: Get best practices for specific components
- `browseDocumentation`: Browse the structure of the documentation
- `getDocumentationTopic`: Get the full content of a specific documentation topic

### Code Analysis Tools

- `analyzeCodeFile`: Analyze a single code file
- `analyzeProject`: Analyze multiple files in a project
- `generateFixSuggestions`: Generate suggestions for fixing issues
- `detectFrameworkAndFileType`: Identify the framework and file type of a code file

## Architecture

This project follows a hexagonal architecture (also known as ports and adapters) to separate business logic from technical concerns:

```
src/
├── core/                 # Core business logic
│   ├── domain/           # Domain entities and value objects
│   │   ├── entities/     # Business entities
│   │   ├── interfaces/   # Repository interfaces (ports)
│   │   └── value-objects/# Value objects
│   └── application/      # Application services and use cases
│       ├── services/     # Services that orchestrate domain logic
│       └── use-cases/    # Specific use cases for the application
└── infrastructure/       # Technical concerns
    ├── adapters/         # Implementation of interfaces (adapters)
    │   ├── documentation/# Documentation repository implementation
    │   └── code-analysis/# Code analysis repository implementation
    └── ports/            # External-facing interfaces
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [NestJS Documentation](https://github.com/nestjs/docs.nestjs.com/tree/master/content)
- [Angular Documentation](https://github.com/angular/angular/tree/main/adev/src/content/guide)
- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol)

---

Created with ❤️
=======

# nestjs-angular-documentation-mcp

A Model Context Protocol (MCP) service that analyzes NestJS and Angular codebases and provides best practice recommendations
