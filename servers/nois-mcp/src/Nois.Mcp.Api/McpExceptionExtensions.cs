using ModelContextProtocol;
using System.Text.Json;

namespace Nois.Mcp.Api;

/// <summary>
/// Core extensions for McpException to provide standardized error handling
/// </summary>
public static class McpExceptionExtensions
{
    /// <summary>
    /// Creates a McpException for not found errors
    /// </summary>
    public static McpException CreateNotFoundException(string resource, string identifier)
    {
        var error = new McpError
        {
            Type = "https://api.nois.com/errors/not-found",
            Title = "Resource Not Found",
            Status = 404,
            Detail = $"{resource} with identifier '{identifier}' was not found",
            Instance = $"/{resource.ToLower()}/{identifier}"
        };

        return new McpException(JsonSerializer.Serialize(error));
    }

    /// <summary>
    /// Creates a McpException for validation errors
    /// </summary>
    public static McpException CreateValidationException(string detail)
    {
        var error = new McpError
        {
            Type = "https://api.nois.com/errors/validation-failed",
            Title = "Validation Failed",
            Status = 400,
            Detail = detail,
            Instance = "/validation"
        };

        return new McpException(JsonSerializer.Serialize(error));
    }

    /// <summary>
    /// Creates a McpException for invalid input parameters
    /// </summary>
    public static McpException CreateInvalidInputException(string parameter, string reason)
    {
        var error = new McpError
        {
            Type = "https://api.nois.com/errors/invalid-input",
            Title = "Invalid Input Parameters",
            Status = 422,
            Detail = $"{parameter}: {reason}",
            Instance = "/input-validation"
        };

        return new McpException(JsonSerializer.Serialize(error));
    }

    /// <summary>
    /// Creates a McpException for Microsoft Graph errors with error code
    /// </summary>
    public static McpException CreateGraphApiException(string operation, string errorCode, string errorMessage)
    {
        var error = new McpError
        {
            Type = "https://api.nois.com/errors/graph-api-error",
            Title = "Microsoft Graph API Error",
            Status = 500,
            Detail = $"{operation}: [Code: {errorCode}] {errorMessage}",
            Instance = "/graph-api"
        };

        return new McpException(JsonSerializer.Serialize(error));
    }

    /// <summary>
    /// Creates a McpException for general operation errors
    /// </summary>
    public static McpException CreateOperationException(string operation, string detail)
    {
        var error = new McpError
        {
            Type = "https://api.nois.com/errors/operation-failed",
            Title = "Operation Failed",
            Status = 500,
            Detail = $"{operation}: {detail}",
            Instance = "/operations"
        };

        return new McpException(JsonSerializer.Serialize(error));
    }

    /// <summary>
    /// Creates a McpException from an exception with context
    /// </summary>
    public static McpException CreateFromException(string context, Exception ex)
    {
        var error = new McpError
        {
            Type = "https://api.nois.com/errors/internal-error",
            Title = "Internal Error",
            Status = 500,
            Detail = $"{context}: {ex.Message}",
            Instance = "/internal"
        };

        return new McpException(JsonSerializer.Serialize(error));
    }
}

/// <summary>
/// Represents a standardized MCP error response
/// </summary>
public class McpError
{
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int Status { get; set; }
    public string Detail { get; set; } = string.Empty;
    public string Instance { get; set; } = string.Empty;
}

/// <summary>
/// Error handler for processing and formatting MCP errors
/// </summary>
public static class McpErrorHandler
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    /// <summary>
    /// Processes Microsoft Graph ODataError and converts to McpException
    /// </summary>
    public static McpException HandleODataError(string operation, Microsoft.Graph.Models.ODataErrors.ODataError odataError)
    {
        var errorCode = odataError.Error?.Code ?? "Unknown";
        var errorMessage = odataError.Error?.Message ?? "No error message provided";

        return McpExceptionExtensions.CreateGraphApiException(operation, errorCode, errorMessage);
    }

    /// <summary>
    /// Processes general exceptions and converts to McpException
    /// </summary>
    public static McpException HandleException(string operation, Exception ex)
    {
        // Check if it's an ODataError
        if (ex is Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            return HandleODataError(operation, odataError);
        }

        // Handle other specific exceptions
        return ex switch
        {
            ArgumentNullException => McpExceptionExtensions.CreateValidationException($"{operation}: Required parameter is null"),
            ArgumentException => McpExceptionExtensions.CreateValidationException($"{operation}: {ex.Message}"),
            InvalidOperationException => McpExceptionExtensions.CreateOperationException(operation, ex.Message),
            _ => McpExceptionExtensions.CreateFromException(operation, ex)
        };
    }

    /// <summary>
    /// Safely executes an async operation with standardized error handling
    /// </summary>
    public static async Task<T> ExecuteWithErrorHandling<T>(
        string operationName,
        Func<Task<T>> operation)
    {
        try
        {
            return await operation();
        }
        catch (Exception ex)
        {
            throw HandleException(operationName, ex);
        }
    }

    /// <summary>
    /// Safely executes a synchronous operation with standardized error handling
    /// </summary>
    public static T ExecuteWithErrorHandling<T>(
        string operationName,
        Func<T> operation)
    {
        try
        {
            return operation();
        }
        catch (Exception ex)
        {
            throw HandleException(operationName, ex);
        }
    }

    /// <summary>
    /// Safely executes an async operation that returns no result with standardized error handling
    /// </summary>
    public static async Task ExecuteWithErrorHandling(
        string operationName,
        Func<Task> operation)
    {
        try
        {
            await operation();
        }
        catch (Exception ex)
        {
            throw HandleException(operationName, ex);
        }
    }
}
