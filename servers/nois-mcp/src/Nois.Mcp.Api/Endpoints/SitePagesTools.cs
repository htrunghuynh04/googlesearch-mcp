using Microsoft.Graph;
using Microsoft.Graph.Models;
using ModelContextProtocol.Server;
using Nois.Mcp.Api;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace Nois.Mcp.Api.Endpoints;

public record GetSitePagesReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,
    [Description("Maximum number of pages to return (optional) - if not provided or 0, returns all pages")]
    int? Top,
    [Description("Filter expression in OData format (optional) - supports operations like 'Title eq \"Page Name\"', 'Title contains \"keyword\"', etc.")]
    string? Filter,
    [Description("List of field names to select (optional) - e.g. ['Title','FileLeafRef','Created','Modified']")]
    string[]? Fields
);

public record SitePageDto(
    string Id,
    string Title,
    string FileLeafRef,
    string? Description,
    string? WebUrl,
    string? Url,
    DateTimeOffset? CreatedDateTime,
    DateTimeOffset? LastModifiedDateTime,
    string? CreatedBy,
    string? ModifiedBy,
    string? PageLayout,
    bool IsPublished,
    IDictionary<string, object> Fields
);

public record GetSitePageByIdReq(
    [Description("The ID of the SharePoint site")]
    [Required]
    string SiteId,
    [Description("The ID of the page/item to retrieve")]
    [Required]
    string PageId
);

[McpServerToolType]
public static class SitePagesTools
{
    [McpServerTool, Description("Retrieves all site pages from a SharePoint site. Site pages are typically stored in the 'Site Pages' library. Returns page information including Title, File name, Created/Modified dates, and other metadata.")]
    public static async Task<List<SitePageDto>> GetSitePages(GetSitePagesReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty");
            }

            // First, get the Site Pages library
            var sitePagesList = await GetSitePagesLibraryAsync(input.SiteId, client);
            if (sitePagesList == null)
            {
                return new List<SitePageDto>();
            }

            // Get items from the Site Pages library
            var itemsRequestBuilder = client.Sites[input.SiteId].Lists[sitePagesList.Id].Items;

            // Apply query parameters
            var itemsRequest = itemsRequestBuilder.GetAsync((requestConfiguration) =>
            {
                // Expand fields to get the page data
                if (input.Fields != null && input.Fields.Length > 0)
                {
                    var fieldsSelect = string.Join(",", input.Fields);
                    requestConfiguration.QueryParameters.Expand = new[] { $"fields(select={fieldsSelect})" };
                }
                else
                {
                    // Default fields for pages
                    requestConfiguration.QueryParameters.Expand = new[] { "fields(select=Title,FileLeafRef,Description,Created,Modified,Editor,Author,CanvasContent1,PageLayout)" };
                }

                // Apply top limit if provided
                if (input.Top.HasValue && input.Top.Value > 0)
                {
                    requestConfiguration.QueryParameters.Top = input.Top;
                }
            });

            var itemsResponse = await itemsRequest;

            // If no items found, return empty list
            if (itemsResponse?.Value == null || itemsResponse.Value.Count == 0)
            {
                return new List<SitePageDto>();
            }

            // Map the Graph API response to our DTO
            var pages = itemsResponse.Value.Select(item => MapListItemToSitePage(item)).ToList();

            // Apply filter if provided
            if (!string.IsNullOrWhiteSpace(input.Filter))
            {
                pages = pages.Where(page => ApplyFilterLocal(page, input.Filter)).ToList();
            }

            return pages;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error retrieving site pages from site '{input.SiteId}'",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error retrieving site pages from site '{input.SiteId}'",
                ex);
        }
    }

    [McpServerTool, Description("Retrieves a specific site page by its ID. Returns detailed page information including content fields, metadata, and all custom properties.")]
    public static async Task<SitePageDto> GetSitePageById(GetSitePageByIdReq input, GraphServiceClient client)
    {
        try
        {
            // Validate input
            if (string.IsNullOrWhiteSpace(input.SiteId))
            {
                throw new ArgumentException("Site ID is required and cannot be empty");
            }
            if (string.IsNullOrWhiteSpace(input.PageId))
            {
                throw new ArgumentException("Page ID is required and cannot be empty");
            }

            // First, get the Site Pages library
            var sitePagesList = await GetSitePagesLibraryAsync(input.SiteId, client);
            if (sitePagesList == null)
            {
                throw new InvalidOperationException("Site Pages library not found in the specified site.");
            }

            // Get the specific item by ID with expanded fields
            var item = await client.Sites[input.SiteId]
                .Lists[sitePagesList.Id]
                .Items[input.PageId]
                .GetAsync((requestConfiguration) =>
                {
                    // Expand fields to get all page data
                    requestConfiguration.QueryParameters.Expand = new[] { "fields" };
                });

            // Check if item was found
            if (item == null)
            {
                throw new InvalidOperationException($"Page with ID '{input.PageId}' not found in the Site Pages library.");
            }

            // Map to DTO
            var result = MapListItemToSitePage(item);

            return result;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error retrieving page '{input.PageId}' from site '{input.SiteId}'",
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
                $"Error retrieving page '{input.PageId}' from site '{input.SiteId}'",
                ex);
        }
    }

    private static async Task<List?> GetSitePagesLibraryAsync(string siteId, GraphServiceClient client)
    {
        // Try to get the Site Pages library
        try
        {
            var listsResponse = await client.Sites[siteId]
                .Lists
                .GetAsync();

            if (listsResponse?.Value == null || listsResponse.Value.Count == 0)
            {
                return null;
            }

            // Look for Site Pages library (common names: "Site Pages", "SitePages", "Pages")
            var sitePagesList = listsResponse.Value.FirstOrDefault(list =>
                string.Equals(list.Name, "Site Pages", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(list.Name, "SitePages", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(list.Name, "Pages", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(list.DisplayName, "Site Pages", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(list.DisplayName, "SitePages", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(list.DisplayName, "Pages", StringComparison.OrdinalIgnoreCase)
            );

            return sitePagesList;
        }
        catch
        {
            // If we can't find Site Pages library, return null
            return null;
        }
    }

    private static SitePageDto MapListItemToSitePage(ListItem item)
    {
        // Extract fields from the item
        var fieldsDict = new Dictionary<string, object>();
        if (item.Fields?.AdditionalData != null)
        {
            foreach (var kvp in item.Fields.AdditionalData)
            {
                fieldsDict[kvp.Key] = kvp.Value ?? string.Empty;
            }
        }

        // Extract specific fields for page properties
        var title = fieldsDict.TryGetValue("Title", out var titleObj) ? titleObj?.ToString() ?? string.Empty : string.Empty;
        var fileLeafRef = fieldsDict.TryGetValue("FileLeafRef", out var fileObj) ? fileObj?.ToString() ?? string.Empty : string.Empty;
        var description = fieldsDict.TryGetValue("Description", out var descObj) ? descObj?.ToString() : null;
        var pageLayout = fieldsDict.TryGetValue("PageLayout", out var layoutObj) ? layoutObj?.ToString() : null;
        
        // Handle created/modified dates
        DateTimeOffset? createdDateTime = item.CreatedDateTime;
        DateTimeOffset? lastModifiedDateTime = item.LastModifiedDateTime;
        
        // Try to get from fields if available
        if (fieldsDict.TryGetValue("Created", out var createdObj) && createdObj is DateTimeOffset createdOffset)
        {
            createdDateTime = createdOffset;
        }
        if (fieldsDict.TryGetValue("Modified", out var modifiedObj) && modifiedObj is DateTimeOffset modifiedOffset)
        {
            lastModifiedDateTime = modifiedOffset;
        }

        // Handle created by and modified by
        var createdBy = fieldsDict.TryGetValue("Author", out var authorObj) ? authorObj?.ToString() : null;
        var modifiedBy = fieldsDict.TryGetValue("Editor", out var editorObj) ? editorObj?.ToString() : null;

        // Check if page is published (simplified check)
        var isPublished = fieldsDict.TryGetValue("_ModerationStatus", out var statusObj) 
            ? statusObj?.ToString() == "0" || statusObj?.ToString() == "Approved"
            : true; // Default to true if no status field

        // Generate URL if possible
        var webUrl = item.WebUrl ?? string.Empty;
        var url = string.IsNullOrEmpty(webUrl) 
            ? (fieldsDict.TryGetValue("FileRef", out var fileRefObj) ? fileRefObj?.ToString() : null)
            : webUrl;

        return new SitePageDto
        (
            item.Id ?? string.Empty,
            title,
            fileLeafRef,
            description,
            webUrl,
            url,
            createdDateTime,
            lastModifiedDateTime,
            createdBy,
            modifiedBy,
            pageLayout,
            isPublished,
            fieldsDict
        );
    }

    private static bool ApplyFilterLocal(SitePageDto page, string filter)
    {
        if (string.IsNullOrWhiteSpace(filter)) return true;

        // Support basic OData operators: eq, ne, contains
        var match = System.Text.RegularExpressions.Regex.Match(filter, @"(\w+)\s+(eq|ne|contains)\s+(.+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!match.Success) return true;

        var fieldName = match.Groups[1].Value;
        var op = match.Groups[2].Value.ToLowerInvariant();
        var rawValue = match.Groups[3].Value.Trim('\'', '"', ' ');

        string fieldValue = fieldName.ToLowerInvariant() switch
        {
            "title" => page.Title ?? string.Empty,
            "fileleafref" => page.FileLeafRef ?? string.Empty,
            "description" => page.Description ?? string.Empty,
            "pagelayout" => page.PageLayout ?? string.Empty,
            "createdby" => page.CreatedBy ?? string.Empty,
            "modifiedby" => page.ModifiedBy ?? string.Empty,
            _ => page.Fields.TryGetValue(fieldName, out var value) ? value?.ToString() ?? string.Empty : string.Empty
        };

        switch (op)
        {
            case "eq":
                return string.Equals(fieldValue, rawValue, StringComparison.OrdinalIgnoreCase);
            case "ne":
                return !string.Equals(fieldValue, rawValue, StringComparison.OrdinalIgnoreCase);
            case "contains":
                return fieldValue.Contains(rawValue, StringComparison.OrdinalIgnoreCase);
            default:
                return true;
        }
    }
}