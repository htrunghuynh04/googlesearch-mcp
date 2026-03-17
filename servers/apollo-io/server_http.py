"""
Apollo.io MCP Server (HTTP Version)

This module provides an HTTP-based MCP (Model Context Protocol) server for Apollo.io API.
It uses FastAPI to handle HTTP requests and MCP protocol for tool execution.

Architecture:
- FastAPI handles HTTP requests and routes them to MCP handlers
- MCP (Model Context Protocol) defines the tool interface for AI assistants
- API key is passed via HTTP header X-Apollo-Api-Key

Endpoints:
- GET  /health: Health check
- POST /mcp: MCP JSON-RPC handler

Usage:
    python server_http.py

Environment Variables:
    PORT: Server port (default: 8000)
    APOLLO_IO_API_KEY: Fallback API key (optional, header takes precedence)

Reference:
    MCP Protocol: https://modelcontextprotocol.io/
    Apollo.io API: https://docs.apollo.io/
"""
from mcp.server.fastmcp import FastMCP
from apollo_client import ApolloClient
from apollo import *
import os
from typing import Optional
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
import asyncio

# Initialize FastMCP server with name
mcp = FastMCP("Apollo.io")

# Initialize FastAPI application
app = FastAPI(
    title="Apollo.io MCP Server",
    description="HTTP-based MCP server for Apollo.io API",
    version="1.0.0"
)


def get_apollo_client_from_headers(headers: dict) -> Optional[ApolloClient]:
    """
    Extract Apollo Client from HTTP headers.

    This function attempts to extract the API key from the request headers
    (case-insensitive) and create an ApolloClient instance.

    Args:
        headers: HTTP headers dictionary from the request

    Returns:
        ApolloClient instance if API key found, None otherwise

    Note:
        The API key can be passed via either "X-Apollo-Api-Key" or "x-apollo-api-key"
    """
    # API key is passed via header: X-Apollo-Api-Key
    # Check both lowercase and uppercase variants for flexibility
    api_key = headers.get("x-apollo-api-key") or headers.get("X-Apollo-Api-Key")

    if not api_key:
        return None

    return ApolloClient(api_key=api_key)


# ============ MCP TOOLS ============
# These are the tools exposed via MCP protocol that AI assistants can call

@mcp.tool()
async def people_enrichment(query: PeopleEnrichmentQuery) -> Optional[dict]:
    """
    MCP tool: Enrich data for a specific person.

    This tool wraps the Apollo.io People Enrichment API endpoint.
    It takes identifying information (email, phone, or Apollo ID) and returns
    detailed information about the person.

    Required:
        User must provide API key via X-Apollo-Api-Key header

    Args:
        query: PeopleEnrichmentQuery object with parameters like:
               - id: Apollo person ID
               - email: Person's email address
               - phone: Person's phone number
               - domain: Company domain
               - first_name, last_name: Person's name

    Returns:
        Dictionary containing person data if successful, error message if failed

    Example request (JSON-RPC):
        {
            "method": "tools/call",
            "params": {
                "name": "people_enrichment",
                "arguments": {
                    "query": {"email": "john@company.com"}
                }
            }
        }
    """
    # Get API key from environment (set by middleware)
    api_key = os.getenv("APOLLO_IO_API_KEY")
    if not api_key:
        return {"error": "Missing X-Apollo-Api-Key header"}

    apollo_client = ApolloClient(api_key=api_key)
    result = await apollo_client.people_enrichment(query)
    return result.model_dump() if result else None


@mcp.tool()
async def organization_enrichment(query: OrganizationEnrichmentQuery) -> Optional[dict]:
    """
    MCP tool: Enrich data for a specific company.

    This tool wraps the Apollo.io Organization Enrichment API endpoint.
    It takes identifying information (domain or Apollo organization ID) and returns
    detailed information about the company.

    Required:
        User must provide API key via X-Apollo-Api-Key header

    Args:
        query: OrganizationEnrichmentQuery object with parameters like:
               - id: Apollo organization ID
               - domain: Company domain (e.g., "company.com")

    Returns:
        Dictionary containing organization data if successful, error message if failed

    Example request (JSON-RPC):
        {
            "method": "tools/call",
            "params": {
                "name": "organization_enrichment",
                "arguments": {
                    "query": {"domain": "example.com"}
                }
            }
        }
    """
    api_key = os.getenv("APOLLO_IO_API_KEY")
    if not api_key:
        return {"error": "Missing X-Apollo-Api-Key header"}

    apollo_client = ApolloClient(api_key=api_key)
    result = await apollo_client.organization_enrichment(query)
    return result.model_dump() if result else None


@mcp.tool()
async def people_search(query: PeopleSearchQuery) -> Optional[dict]:
    """
    MCP tool: Search for people by criteria.

    This tool wraps the Apollo.io People Search API endpoint.
    It allows searching for people based on job titles, seniority, location,
    company, industry, and many other criteria.

    Required:
        User must provide API key via X-Apollo-Api-Key header

    Args:
        query: PeopleSearchQuery object with common parameters like:
               - person_titles: List of job titles (e.g., ["CEO", "CTO"])
               - person_seniorities: Seniority levels (e.g., ["vp", "director"])
               - organization_locations: Location filters (e.g., ["USA", "UK"])
               - organization_industries: Industry filters (e.g., ["technology"])
               - organization_num_employees_ranges: Company size (e.g., ["100,1000"])
               - q_organization_domains_list: Company domains
               - page: Page number (starts from 1)
               - per_page: Results per page (max 100)

    Returns:
        Dictionary containing search results if successful, error message if failed

    Example request (JSON-RPC):
        {
            "method": "tools/call",
            "params": {
                "name": "people_search",
                "arguments": {
                    "query": {
                        "person_titles": ["CEO"],
                        "organization_locations": ["USA"],
                        "per_page": 10
                    }
                }
            }
        }
    """
    api_key = os.getenv("APOLLO_IO_API_KEY")
    if not api_key:
        return {"error": "Missing X-Apollo-Api-Key header"}

    apollo_client = ApolloClient(api_key=api_key)
    result = await apollo_client.people_search(query)
    return result.model_dump() if result else None


@mcp.tool()
async def organization_search(query: OrganizationSearchQuery) -> Optional[dict]:
    """
    MCP tool: Search for organizations by criteria.

    This tool wraps the Apollo.io Organization Search API endpoint.
    It allows searching for companies based on employee count, location,
    industry, domain, and many other criteria.

    Required:
        User must provide API key via X-Apollo-Api-Key header

    Args:
        query: OrganizationSearchQuery object with common parameters like:
               - organization_num_employees_ranges: Company size (e.g., ["100,500"])
               - organization_locations: Location filters (e.g., ["USA"])
               - organization_industries: Industry filters (e.g., ["technology"])
               - q_organization_domains_list: Company domains to search
               - page: Page number
               - per_page: Results per page

    Returns:
        Dictionary containing search results if successful, error message if failed

    Example request (JSON-RPC):
        {
            "method": "tools/call",
            "params": {
                "name": "organization_search",
                "arguments": {
                    "query": {
                        "organization_industries": ["technology"],
                        "organization_num_employees_ranges": ["100,1000"]
                    }
                }
            }
        }
    """
    api_key = os.getenv("APOLLO_IO_API_KEY")
    if not api_key:
        return {"error": "Missing X-Apollo-Api-Key header"}

    apollo_client = ApolloClient(api_key=api_key)
    result = await apollo_client.organization_search(query)
    return result.model_dump() if result else None


@mcp.tool()
async def organization_job_postings(organization_id: str) -> Optional[dict]:
    """
    MCP tool: Get job postings for a specific organization.

    This tool wraps the Apollo.io Organization Job Postings API endpoint.
    It returns job openings indexed on Apollo for a given company.

    Required:
        User must provide API key via X-Apollo-Api-Key header

    Args:
        organization_id: Apollo organization ID (not domain)
               Example: "5e66b6381e05b4008c8331b8"

    Returns:
        Dictionary containing job postings if successful, error message if failed

    Example request (JSON-RPC):
        {
            "method": "tools/call",
            "params": {
                "name": "organization_job_postings",
                "arguments": {
                    "organization_id": "5e66b6381e05b4008c8331b8"
                }
            }
        }
    """
    api_key = os.getenv("APOLLO_IO_API_KEY")
    if not api_key:
        return {"error": "Missing X-Apollo-Api-Key header"}

    apollo_client = ApolloClient(api_key=api_key)
    result = await apollo_client.organization_job_postings(organization_id)
    return result.model_dump() if result else None


# ============ FASTAPI SERVER ============
# FastAPI handles HTTP routing and middleware

@app.middleware("http")
async def set_api_key_from_header(request: Request, call_next):
    """
    Middleware to extract API key from HTTP header and set it to environment.

    This middleware runs before each request and extracts the X-Apollo-Api-Key
    header (if present) and stores it in the OS environment variable APOLLO_IO_API_KEY.
    The MCP tools then read this from the environment.

    This design allows the API key to be passed per-request while still being
    accessible to the async MCP tool functions.

    Args:
        request: FastAPI Request object
        call_next: Next middleware/handler in the chain

    Returns:
        Response from the next handler

    Note:
        - The header name is case-insensitive
        - If no header is provided, existing environment variable (if any) is used
    """
    api_key = request.headers.get("X-Apollo-Api-Key")
    if api_key:
        os.environ["APOLLO_IO_API_KEY"] = api_key

    response = await call_next(request)
    return response


@app.get("/health")
async def health_check():
    """
    Health check endpoint.

    Returns a simple status response to verify the server is running.
    This endpoint does not require authentication.

    Returns:
        JSON response with status and service name

    Example Response:
        {
            "status": "healthy",
            "service": "Apollo.io MCP Server"
        }
    """
    return {"status": "healthy", "service": "Apollo.io MCP Server"}


@app.post("/mcp")
async def handle_mcp(request: Request):
    """
    Handle MCP JSON-RPC requests.

    This endpoint implements the MCP (Model Context Protocol) JSON-RPC 2.0 specification.
    It handles the following methods:
    - initialize: Called at the start of a session to negotiate protocol version
    - tools/list: Returns the list of available tools
    - tools/call: Executes a specific tool with given arguments

    The handler extracts the API key from the X-Apollo-Api-Key header and
    passes it to the underlying MCP tools.

    Request Format (JSON-RPC 2.0):
        {
            "jsonrpc": "2.0",
            "id": <request_id>,
            "method": "<method_name>",
            "params": { ... }
        }

    Response Format (JSON-RPC 2.0):
        Success:
            {
                "jsonrpc": "2.0",
                "id": <request_id>,
                "result": { ... }
            }
        Error:
            {
                "jsonrpc": "2.0",
                "id": <request_id> or null,
                "error": {
                    "code": <error_code>,
                    "message": <error_message>
                }
            }

    Error Codes:
        -32700: Parse error - Invalid JSON
        -32600: Invalid request - Missing method or params
        -32601: Method not found - Unknown method
        -32602: Invalid params - Missing required parameter
        -32603: Internal error - Server-side error

    Args:
        request: FastAPI Request object containing JSON-RPC body

    Returns:
        JSONResponse with JSON-RPC formatted result or error

    Example - Initialize:
        Request:
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
        Response:
            {
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "Apollo.io MCP Server", "version": "1.0.0"}
                }
            }

    Example - List Tools:
        Request:
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        Response:
            {
                "jsonrpc": "2.0",
                "id": 2,
                "result": {
                    "tools": [
                        {"name": "people_enrichment", "description": "...", "inputSchema": {...}},
                        ...
                    ]
                }
            }

    Example - Call Tool:
        Request:
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "people_search",
                    "arguments": {"query": {...}}
                }
            }
    """
    try:
        body = await request.json()

        # MCP JSON-RPC handling
        method = body.get("method")
        params = body.get("params", {})
        request_id = body.get("id")

        # Handle different MCP methods
        if method == "initialize":
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "Apollo.io MCP Server",
                        "version": "1.0.0"
                    }
                }
            })

        elif method == "tools/list":
            # Return list of tools
            tools = [
                {
                    "name": "people_enrichment",
                    "description": "Use the People Enrichment endpoint to enrich data for 1 person.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "object"}
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "organization_enrichment",
                    "description": "Use the Organization Enrichment endpoint to enrich data for 1 company.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "object"}
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "people_search",
                    "description": "Use the People Search endpoint to find people.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "object"}
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "organization_search",
                    "description": "Use the Organization Search endpoint to find organizations.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "object"}
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "organization_job_postings",
                    "description": "Use the Organization Job Postings endpoint to find job postings.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "organization_id": {"type": "string"}
                        },
                        "required": ["organization_id"]
                    }
                }
            ]

            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {"tools": tools}
            })

        elif method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})

            # Check API key - required for all tool calls
            api_key = request.headers.get("X-Apollo-Api-Key")
            if not api_key:
                return JSONResponse({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32602,
                        "message": "Missing X-Apollo-Api-Key header"
                    }
                })

            # Execute the requested tool
            result = None
            try:
                if tool_name == "people_enrichment":
                    query = PeopleEnrichmentQuery(**tool_args.get("query", {}))
                    result = await people_enrichment(query)

                elif tool_name == "organization_enrichment":
                    query = OrganizationEnrichmentQuery(**tool_args.get("query", {}))
                    result = await organization_enrichment(query)

                elif tool_name == "people_search":
                    query = PeopleSearchQuery(**tool_args.get("query", {}))
                    result = await people_search(query)

                elif tool_name == "organization_search":
                    query = OrganizationSearchQuery(**tool_args.get("query", {}))
                    result = await organization_search(query)

                elif tool_name == "organization_job_postings":
                    org_id = tool_args.get("organization_id")
                    result = await organization_job_postings(org_id)

                else:
                    return JSONResponse({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "error": {
                            "code": -32601,
                            "message": f"Method not found: {tool_name}"
                        }
                    })

                # Return result in MCP content format
                return JSONResponse({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": str(result)
                            }
                        ]
                    }
                })

            except Exception as e:
                return JSONResponse({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32603,
                        "message": f"Internal error: {str(e)}"
                    }
                })

        else:
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            })

    except Exception as e:
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": None,
            "error": {
                "code": -32700,
                "message": f"Parse error: {str(e)}"
            }
        })


if __name__ == "__main__":
    import uvicorn

    # Get port from environment variable, default to 8000
    port = int(os.getenv("PORT", 8000))
    print(f"Starting Apollo.io MCP server on port {port}")
    print("API key will be read from HTTP header X-Apollo-Api-Key")

    # Run the FastAPI server
    uvicorn.run(app, host="0.0.0.0", port=port)
