using Microsoft.Graph;
using Microsoft.Graph.Models;
using ModelContextProtocol.Server;
using Nois.Mcp.Api;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Nois.Mcp.Api.Endpoints;

// -------------------------------------------------------------------------
// Request & DTO Models
// -------------------------------------------------------------------------

// Request model for retrieving lists
public record GetListsReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId
);

// Request model for retrieving items from a list
public record ListItemsReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,

    [Description("The ID of the SharePoint list")]
    [Required]
    string ListId,

    [Description("Maximum number of items to return (optional)")]
    int? Top = null,

    [Description("OData filter expression (optional). Example: fields/Title eq 'Test'")]
    string? Filter = null
);

// DTO for list info
public record ListDto(
    string Id,
    string Name,
    string DisplayName,
    string? Description,
    string? WebUrl,
    DateTimeOffset? CreatedDateTime,
    DateTimeOffset? LastModifiedDateTime,
    IDictionary<string, object>? AdditionalData
);

// DTO for list item info
public record ListsListItemDto(
    string Id,
    string? WebUrl,
    DateTimeOffset? CreatedDateTime,
    DateTimeOffset? LastModifiedDateTime,
    IDictionary<string, object>? Fields
);

// Request model for updating a list item
public record UpdateItemReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,

    [Description("The ID of the SharePoint list")]
    [Required]
    string ListId,

    [Description("The ID of the item to update")]
    [Required]
    string ItemId,

    [Description("Key-value pairs of fields to update")]
    [Required]
    IDictionary<string, object> Fields
);

// Request model for deleting a list item
public record DeleteItemReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,

    [Description("The ID of the SharePoint list")]
    [Required]
    string ListId,

    [Description("The ID of the item to delete")]
    [Required]
    string ItemId
);

// Result model for delete operation
public record DeleteItemResult(
    bool Success,
    string Message
);

// Request model for retrieving list schema
public record GetListSchemaReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,
    [Description("The ID of the SharePoint list")]
    [Required]
    string ListId
);

// DTO for list column info
public record ListColumnDto(
    string Name,
    string DisplayName,
    string Type,
    bool Required,
    IList<string>? Choices,
    object? DefaultValue
);

// Request model for retrieving item by ID
public record GetItemByIdReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,
    [Description("The ID of the SharePoint list")]
    [Required]
    string ListId,
    [Description("The ID of the item to retrieve")]
    [Required]
    string ItemId
);

// DTO for detailed list item info
public record ListItemDto(
    string Id,
    string WebUrl,
    DateTimeOffset? CreatedDateTime,
    DateTimeOffset? LastModifiedDateTime,
    IDictionary<string, object> Fields
);

// Request model for creating a list item
public record CreateItemReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,
    [Description("The ID of the SharePoint list")]
    [Required]
    string ListId,
    [Description("Key-value pairs for the item's fields")]
    IDictionary<string, object> Fields
);

// DTO for created item info
public record CreatedItemDto(
    string Id,
    IDictionary<string, object> Fields,
    DateTimeOffset? CreatedDateTime
);

// -------------------------------------------------------------------------
// Combined Tool Group
// -------------------------------------------------------------------------

[McpServerToolType]
public static class ListsTools
{
    private static readonly HashSet<string> _excludedFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "@odata.etag", "ContentType", "Modified", "Created",
        "AuthorLookupId", "EditorLookupId", "_UIVersionString",
        "Attachments", "Edit", "LinkTitleNoMenu", "ItemChildCount",
        "FolderChildCount", "_ComplianceFlags", "_ComplianceTag",
        "_ComplianceTagWrittenTime", "_ComplianceTagUserId", "LinkTitle"
    };

    // -------------------------------------------------------------------------
    // Tool 1: Get all lists in a site
    // -------------------------------------------------------------------------
    [McpServerTool, Description("Retrieves all lists for a given SharePoint site. Returns a list of lists with properties: Id, Name, DisplayName, Description, WebUrl, CreatedDateTime, LastModifiedDateTime.")]
    public static async Task<List<ListDto>> GetLists(GetListsReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty.");
            }

            // Call Microsoft Graph to get lists
            var listsResponse = await client.Sites[input.SiteId]
                .Lists
                .GetAsync();

            // Handle empty case
            if (listsResponse?.Value == null || listsResponse.Value.Count == 0)
            {
                return new List<ListDto>();
            }

            // Map results
            return listsResponse.Value.Select(list => new ListDto(
                list.Id ?? string.Empty,
                list.Name ?? string.Empty,
                list.DisplayName ?? string.Empty,
                list.Description,
                list.WebUrl,
                list.CreatedDateTime,
                list.LastModifiedDateTime,
                list.AdditionalData
            )).ToList();
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error retrieving lists for site '{input.SiteId}'",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error retrieving lists for site '{input.SiteId}'",
                ex);
        }
    }

    // -------------------------------------------------------------------------
    // Tool 2: Get items of a specific list
    // -------------------------------------------------------------------------
    [McpServerTool, Description("Retrieves items of a SharePoint list with flattened fields. Supports optional $top and $filter query parameters.")]
    public static async Task<List<ListsListItemDto>> ListItems(ListItemsReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty.");
            }

            if (string.IsNullOrWhiteSpace(input.ListId))
            {
                throw new ArgumentException("List ID is required and cannot be empty.");
            }

            // Build query options
            var queryParams = new Microsoft.Graph.Sites.Item.Lists.Item.Items.ItemsRequestBuilder.ItemsRequestBuilderGetQueryParameters
            {
                Expand = new[] { "fields" }, // include fields (flattened data)
                Top = input.Top,
                Filter = input.Filter
            };

            // Call Graph API
            var itemsResponse = await client.Sites[input.SiteId]
                .Lists[input.ListId]
                .Items
                .GetAsync(requestConfig =>
                {
                    requestConfig.QueryParameters = queryParams;
                });

            // Handle empty case
            if (itemsResponse?.Value == null || itemsResponse.Value.Count == 0)
            {
                return new List<ListsListItemDto>();
            }

            // Map results to DTO
            var items = itemsResponse.Value.Select(item => new ListsListItemDto(
                Id: item.Id ?? string.Empty,
                WebUrl: item.WebUrl,
                CreatedDateTime: item.CreatedDateTime,
                LastModifiedDateTime: item.LastModifiedDateTime,
                Fields: item.Fields?.AdditionalData?
                .Where(kv => !_excludedFields.Contains(kv.Key))
                .ToDictionary(kv => kv.Key, kv => kv.Value) // flattened field key-value pairs
            )).ToList();

            return items;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error retrieving list items for site '{input.SiteId}' and list '{input.ListId}'",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error retrieving list items for site '{input.SiteId}' and list '{input.ListId}'",
                ex);
        }
    }

    // -------------------------------------------------------------------------
    // Tool 3: Update a specific list item
    // -------------------------------------------------------------------------
    [McpServerTool, Description("Updates specific fields of an existing SharePoint list item. Returns updated item with Id, WebUrl, CreatedDateTime, LastModifiedDateTime, Fields (flattened).")]
    public static async Task<ListsListItemDto> UpdateItem(UpdateItemReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty.");
            }

            if (string.IsNullOrWhiteSpace(input.ListId))
            {
                throw new ArgumentException("List ID is required and cannot be empty.");
            }

            if (string.IsNullOrWhiteSpace(input.ItemId))
            {
                throw new ArgumentException("Item ID is required and cannot be empty.");
            }

            if (input.Fields == null || input.Fields.Count == 0)
            {
                throw new ArgumentException("Fields dictionary is required and cannot be empty.");
            }

            // Prepare the update payload
            var listItem = new ListItem
            {
                Fields = new FieldValueSet
                {
                    AdditionalData = new Dictionary<string, object>(input.Fields, StringComparer.OrdinalIgnoreCase)
                }
            };

            // Call Graph API to update the item
            var updatedItemResponse = await client.Sites[input.SiteId]
                .Lists[input.ListId]
                .Items[input.ItemId]
                .PatchAsync(listItem);

            // Handle null response (item might not exist)
            if (updatedItemResponse == null)
            {
                throw new InvalidOperationException($"Item with ID '{input.ItemId}' not found in list '{input.ListId}' on site '{input.SiteId}'.");
            }

            // Map the updated item to DTO (fetch fields with expansion to get flattened data)
            var itemWithFields = await client.Sites[input.SiteId]
                .Lists[input.ListId]
                .Items[input.ItemId]
                .GetAsync(requestConfig =>
                {
                    requestConfig.QueryParameters.Expand = new[] { "fields" };
                });

            // Return the updated item with flattened fields
            return new ListsListItemDto(
                Id: updatedItemResponse.Id ?? string.Empty,
                WebUrl: updatedItemResponse.WebUrl,
                CreatedDateTime: updatedItemResponse.CreatedDateTime,
                LastModifiedDateTime: updatedItemResponse.LastModifiedDateTime,
                Fields: itemWithFields?.Fields?.AdditionalData?
                    .Where(kv => !_excludedFields.Contains(kv.Key))
                    .ToDictionary(kv => kv.Key, kv => kv.Value) // flattened field key-value pairs
            );
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error updating list item '{input.ItemId}' in site '{input.SiteId}' and list '{input.ListId}'",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error updating list item '{input.ItemId}' in site '{input.SiteId}' and list '{input.ListId}'",
                ex);
        }
    }

    // -------------------------------------------------------------------------
    // Tool 4: Delete a specific list item
    // -------------------------------------------------------------------------
    [McpServerTool, Description("Deletes a SharePoint list item by its ID. Returns Success=true with confirmation message, or errors if item does not exist.")]
    public static async Task<DeleteItemResult> DeleteItem(DeleteItemReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty.");
            }

            if (string.IsNullOrWhiteSpace(input.ListId))
            {
                throw new ArgumentException("List ID is required and cannot be empty.");
            }

            if (string.IsNullOrWhiteSpace(input.ItemId))
            {
                throw new ArgumentException("Item ID is required and cannot be empty.");
            }

            // Call Graph API to delete the item
            await client.Sites[input.SiteId]
                .Lists[input.ListId]
                .Items[input.ItemId]
                .DeleteAsync();

            // Return success result
            return new DeleteItemResult(
                Success: true,
                Message: $"Item with ID '{input.ItemId}' has been successfully deleted from list '{input.ListId}' in site '{input.SiteId}'."
            );
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error deleting list item '{input.ItemId}' from site '{input.SiteId}' and list '{input.ListId}'",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error deleting list item '{input.ItemId}' from site '{input.SiteId}' and list '{input.ListId}'",
                ex);
        }
    }

    // -------------------------------------------------------------------------
    // Tool 5: Get list schema/columns
    // -------------------------------------------------------------------------
    [McpServerTool, Description("Retrieves column schema for a given SharePoint list. Returns list of columns with properties: Name, DisplayName, Type, Required, Choices, DefaultValue.")]
    public static async Task<List<ListColumnDto>> GetListSchema(GetListSchemaReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty");
            }
            if (string.IsNullOrWhiteSpace(input.ListId))
            {
                throw new ArgumentException("List ID is required and cannot be empty");
            }

            // Get list columns
            var columnsResponse = await client.Sites[input.SiteId]
                .Lists[input.ListId]
                .Columns
                .GetAsync();

            // If no columns found, return empty list
            if (columnsResponse?.Value == null || columnsResponse.Value.Count == 0)
            {
                return new List<ListColumnDto>();
            }

            // Map the Graph API response to our DTO
            var columns = columnsResponse.Value.Select(column => new ListColumnDto
            (
                column.Name ?? string.Empty,
                column.DisplayName ?? string.Empty,
                column.AdditionalData?.ContainsKey("type") == true
                    ? column.AdditionalData["type"]?.ToString() ?? string.Empty
                    : string.Empty,
                column.AdditionalData?.ContainsKey("required") == true
                    ? bool.TryParse(column.AdditionalData["required"]?.ToString(), out var required) && required
                    : false,
                column.AdditionalData?.ContainsKey("choices") == true
                    ? ((JsonElement)column.AdditionalData["choices"]).EnumerateArray().Select(e => e.GetString() ?? string.Empty).ToList()
                    : null,
                column.AdditionalData?.ContainsKey("defaultValue") == true
                    ? column.AdditionalData["defaultValue"]
                    : null
            )).ToList();

            return columns;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error retrieving schema for list '{input.ListId}' in site '{input.SiteId}'",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error retrieving schema for list '{input.ListId}' in site '{input.SiteId}'",
                ex);
        }
    }

    // -------------------------------------------------------------------------
    // Tool 6: Get item by ID
    // -------------------------------------------------------------------------
    [McpServerTool, Description("Retrieves a single SharePoint list item by its ID. Returns full item details including Id, WebUrl, CreatedDateTime, LastModifiedDateTime, and all Fields (flattened).")]
    public static async Task<ListItemDto> GetItemById(GetItemByIdReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty");
            }
            if (string.IsNullOrWhiteSpace(input.ListId))
            {
                throw new ArgumentException("List ID is required and cannot be empty");
            }
            if (string.IsNullOrWhiteSpace(input.ItemId))
            {
                throw new ArgumentException("Item ID is required and cannot be empty");
            }

            // Get the specific item by ID with expanded fields
            var item = await client.Sites[input.SiteId]
                .Lists[input.ListId]
                .Items[input.ItemId]
                .GetAsync((requestConfiguration) =>
                {
                    // Expand fields to get all field data
                    requestConfiguration.QueryParameters.Expand = new[] { "fields" };
                });

            // Check if item was found
            if (item == null)
            {
                throw new InvalidOperationException($"Item with ID '{input.ItemId}' not found in list '{input.ListId}'");
            }

            // Extract and flatten fields
            var fieldsDict = new Dictionary<string, object>();
            if (item.Fields?.AdditionalData != null)
            {
                foreach (var kvp in item.Fields.AdditionalData)
                {
                    fieldsDict[kvp.Key] = kvp.Value ?? string.Empty;
                }
            }

            // Map to DTO
            var result = new ListItemDto
            (
                item.Id ?? string.Empty,
                item.WebUrl ?? string.Empty,
                item.CreatedDateTime,
                item.LastModifiedDateTime,
                fieldsDict
            );

            return result;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error retrieving item '{input.ItemId}' from site '{input.SiteId}' and list '{input.ListId}'",
                errorCode,
                errorMessage);
        }
        catch (ArgumentException)
        {
            // Re-throw validation errors as-is
            throw;
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error retrieving item '{input.ItemId}' from site '{input.SiteId}' and list '{input.ListId}'",
                ex);
        }
    }

    // -------------------------------------------------------------------------
    // Tool 7: Create a new list item
    // -------------------------------------------------------------------------
    [McpServerTool, Description("Creates a new SharePoint list item. Required fields must be provided. SharePoint generates the ID automatically.")]
    public static async Task<CreatedItemDto> CreateItem(CreateItemReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty");
            }
            if (string.IsNullOrWhiteSpace(input.ListId))
            {
                throw new ArgumentException("List ID is required and cannot be empty");
            }
            if (input.Fields == null || input.Fields.Count == 0)
            {
                throw new ArgumentException("Fields are required and cannot be empty");
            }

            // Get list schema to validate required fields
            var schema = await GetListSchema(new GetListSchemaReq(input.SiteId, input.ListId), client);
            var requiredFields = schema.Where(c => c.Required).Select(c => c.Name).ToList();

            // Validate required fields
            var missingRequiredFields = requiredFields.Except(input.Fields.Keys, StringComparer.OrdinalIgnoreCase).ToList();
            if (missingRequiredFields.Any())
            {
                throw new ArgumentException($"Missing required fields: {string.Join(", ", missingRequiredFields)}. Required fields must be provided to create the item.");
            }

            // Validate field names against schema (allow extra fields but warn about unknown ones)
            var validFieldNames = schema.Select(c => c.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var unknownFields = input.Fields.Keys.Except(validFieldNames, StringComparer.OrdinalIgnoreCase).ToList();

            if (unknownFields.Any())
            {
                throw new ArgumentException($"Unknown fields provided: {string.Join(", ", unknownFields)}. Please check the field names against the list schema.");
            }

            // Create the list item
            var listItemCreateRequest = new ListItem
            {
                Fields = new FieldValueSet
                {
                    AdditionalData = input.Fields
                }
            };

            var createdItem = await client.Sites[input.SiteId]
                .Lists[input.ListId]
                .Items
                .PostAsync(listItemCreateRequest);

            if (createdItem == null)
            {
                throw new InvalidOperationException("Failed to create list item: SharePoint returned null response");
            }

            // Map the response to our DTO
            var fieldsDict = createdItem.Fields?.AdditionalData?.ToDictionary(kvp => kvp.Key, kvp => kvp.Value)
                           ?? new Dictionary<string, object>();

            var result = new CreatedItemDto
            (
                createdItem.Id ?? string.Empty,
                fieldsDict,
                createdItem.CreatedDateTime
            );

            return result;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error creating item in site '{input.SiteId}' and list '{input.ListId}'",
                errorCode,
                errorMessage);
        }
        catch (ArgumentException)
        {
            // Re-throw validation errors as-is
            throw;
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error creating item in site '{input.SiteId}' and list '{input.ListId}'",
                ex);
        }
    }
}