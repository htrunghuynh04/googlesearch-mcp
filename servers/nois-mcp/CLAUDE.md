# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nois.Mcp is a .NET 9 MCP (Model Context Protocol) server that exposes SharePoint and Microsoft Graph operations as MCP tools. It allows AI assistants to interact with SharePoint sites, drives, lists, and files through a standardized protocol.

## Build and Run Commands

```bash
# Build the solution
cd src && dotnet build

# Run the API (from src directory)
dotnet run --project Nois.Mcp.Api

# Run with watch for development
dotnet watch --project Nois.Mcp.Api

# Restore dependencies
dotnet restore Nois.Mcp.sln

# Build Docker image (from src directory)
docker build -f Nois.Mcp.Api/Dockerfile -t noismcp .
```

## Architecture

The solution follows Clean Architecture with four projects:

- **Nois.Mcp.Api** - ASP.NET Core web host exposing MCP endpoint at `/mcp`. Contains MCP tool definitions in `Endpoints/` as static classes decorated with `[McpServerToolType]` and `[McpServerTool]` attributes.
- **Nois.Mcp.Application** - Application layer with DTOs and service interfaces (mostly placeholder structure).
- **Nois.Mcp.Infrastructure** - Microsoft Graph client configuration and Azure AD authentication via `ClientSecretCredential`.
- **Nois.Mcp.Domain** - Domain entities and enumerations.

## MCP Tools Pattern

Tools are defined as static methods in `src/Nois.Mcp.Api/Endpoints/`:

```csharp
[McpServerToolType]
public static class SitesTools
{
    [McpServerTool, Description("Tool description for the AI")]
    public static async Task<ResultDto> ToolName(RequestDto input, GraphServiceClient client)
    {
        // Implementation using injected GraphServiceClient
    }
}
```

Key tool files:
- `SitesTools.cs` - SharePoint site discovery
- `DrivesTools.cs` - Drive/folder browsing, file moving
- `ListsTools.cs` - SharePoint list CRUD operations (GetLists, ListItems, CreateItem, UpdateItem, DeleteItem, GetListSchema, GetItemById)
- `SitePagesTools.cs` - Site page operations

## Configuration

Azure AD credentials for Microsoft Graph are configured in `appsettings.json` under the `AzureAD` section:

```json
{
  "AzureAD": {
    "TenantId": "...",
    "ClientId": "...",
    "ClientSecret": "...",
    "Scopes": "https://graph.microsoft.com/.default",
    "SupportSites": "Site1,Site2"  // Optional: comma-separated list to filter sites
  }
}
```

Use user secrets for local development: `dotnet user-secrets set "AzureAD:ClientSecret" "your-secret"`

## Error Handling

Use `McpExceptionExtensions` in `McpExceptionExtensions.cs` for standardized error responses:

```csharp
throw McpExceptionExtensions.CreateGraphApiException("Operation description", errorCode, errorMessage);
throw McpExceptionExtensions.CreateNotFoundException("Resource", "identifier");
throw McpExceptionExtensions.CreateValidationException("Validation message");
```

## Dependencies

- `ModelContextProtocol.AspNetCore` - MCP server implementation
- `Microsoft.Graph` - SharePoint/Graph API client
- `Azure.Identity` - Azure AD authentication
- `Serilog` - Structured logging
- `ClosedXML`, `PdfPig` - File format handling (currently commented out)
