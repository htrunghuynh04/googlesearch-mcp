using Microsoft.Graph;
using Microsoft.Graph.Models;
using ModelContextProtocol.Server;
using Nois.Mcp.Api;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Nois.Mcp.Api.Endpoints;

public record GetDriveChildReq(
    [Description("SiteId from special site with format required. eg: cotoso.sharepoint.com,7f1f8de9-8ca1-4b82-8111-6261486f1372,424a4918-6334-4537-af71-5bf19378ca2a")]
    [Required]
    string SiteId,
    [Description("Folder path within the drive. Use empty for root or '/Folder/Subfolder' for specific folders.")]
    string FolderPath
);

/// <summary>
/// Request model for moving a file to a different folder
/// </summary>
public record MoveFileReq(
    [Description("SiteId from special site with format required. eg: cotoso.sharepoint.com,7f1f8de9-8ca1-4b82-8111-6261486f1372,424a4918-6334-4537-af71-5bf19378ca2a")]
    [Required]
    string SiteId,
    [Description("ID of the file to move")]
    [Required]
    string DriveItemId,
    [Description("ID of the target folder")]
    [Required]
    string NewParentFolderId
);

/// <summary>
/// Represents the result of a file move operation
/// </summary>
public record MoveFilesResult(
    bool Success,
    string Message,
    string? ItemId,
    string? NewUrl
);

/// <summary>
/// Represents a drive item (file or folder) in Microsoft Graph
/// </summary>
public record DriveItemDto(
    DateTimeOffset CreatedDateTime,
    [property: JsonPropertyName("eTag")] string ETag,
    string Id,
    DateTimeOffset? LastModifiedDateTime,
    string Name,
    string WebUrl,
    [property: JsonPropertyName("cTag")] string CTag,
    long Size,
    UserInfoDto CreatedBy,
    UserInfoDto LastModifiedBy,
    ParentReferenceDto ParentReference,
    FileSystemInfoDto FileSystemInfo,
    SharedInfoDto Shared,
    // Optional properties for files
    string? DownloadUrl,
    FolderInfoDto? Folder,
    FileInfoDto? File
);

/// <summary>
/// User information
/// </summary>
public record UserInfoDto(UserDto User);

/// <summary>
/// User details
/// </summary>
public record UserDto(
    string Id,
    string DisplayName
);

/// <summary>
/// Parent reference information
/// </summary>
public record ParentReferenceDto(
    string DriveType,
    string DriveId,
    string Id,
    string Name,
    string Path,
    string SiteId
);

/// <summary>
/// File system information
/// </summary>
public record FileSystemInfoDto(
    DateTimeOffset? CreatedDateTime,
    DateTimeOffset? LastModifiedDateTime
);

/// <summary>
/// Folder information (only present for folders)
/// </summary>
public record FolderInfoDto(int ChildCount);

/// <summary>
/// File information (only present for files)
/// </summary>
public record FileInfoDto(
    string MimeType
);


/// <summary>
/// Shared information
/// </summary>
public record SharedInfoDto(string Scope);

[McpServerToolType]
public static class DrivesTools
{
    [McpServerTool, Description("Retrieves a list of drive items (files and folders) within a specified SharePoint site and folder path. Use this tool to browse or list contents of a drive, similar to listing directory contents. Provide a siteId from a previous 'get_sites' call if needed. If need covert to markdown using output field 'downloadUrl'")]
    public static async Task<List<DriveItemDto>> GetDriveChilds(GetDriveChildReq input, GraphServiceClient client)
    {
        var driveRootRes = await client.Sites[input.SiteId].Drive.GetAsync();

        var driveId = driveRootRes.Id;
        try
        {
            // Fix: Use .ItemWithPath(input.FolderPath).Children instead of .Root.Children
            DriveItemCollectionResponse driveItemsRes;

            if (string.IsNullOrEmpty(input.FolderPath))
            {
                driveItemsRes = await client.Drives[driveId].Root.ItemWithPath("")
                    .Children
                    .WithUrl("https://graph.microsoft.com/v1.0/drives/" + driveId + "/root/children")
                    .GetAsync();
            }
            else
            {
                driveItemsRes = await client.Drives[driveId]
                   .Root
                   .ItemWithPath(input.FolderPath ?? "")
                   .Children
                   .GetAsync();
            }



            var driveItems = driveItemsRes?.Value;
            var items = MapDriveItems(driveItems);
            return items;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                $"Error retrieving drive items for site '{input.SiteId}' and folder path '{input.FolderPath}'",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException(
                $"Error retrieving drive items for site '{input.SiteId}' and folder path '{input.FolderPath}'",
                ex);
        }
    }

    [McpServerTool, Description("Moves a file to a target folder while preserving the original file name")]
    public static async Task MoveFile(MoveFileReq input, GraphServiceClient client)
    {
        try
        {
            var driveRootRes = await client.Sites[input.SiteId].Drive.GetAsync();
            var driveId = driveRootRes.Id;
            var sourceItem = await client.Drives[driveId].Items[input.DriveItemId].GetAsync();

            // Prepare the request body to move the file
            var requestBody = new DriveItem
            {
                ParentReference = new ItemReference
                {
                    Id = input.NewParentFolderId, // target folder ID
                },
                Name = sourceItem.Name, // retain original file name
            };

            // Execute the move operation
            var result = await client.Drives[driveId].Items[input.DriveItemId].PatchAsync(requestBody);
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                "Error moving file",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException("Error moving file", ex);
        }
    }
    private static List<DriveItemDto> MapDriveItems(IList<DriveItem>? driveItems)
    {
        if (driveItems == null || driveItems.Count == 0)
        {
            return [];
        }
        var items = driveItems.ToList().Select(x => new DriveItemDto(
            x.CreatedDateTime.GetValueOrDefault(),
            x.ETag ?? string.Empty,
            x.Id ?? string.Empty,
            x.LastModifiedDateTime.GetValueOrDefault(),
            x.Name ?? string.Empty,
            x.WebUrl ?? string.Empty,
            x.CTag ?? string.Empty,
            x.Size.GetValueOrDefault(),
            new UserInfoDto(
                new UserDto(
                    x.CreatedBy?.User?.Id ?? string.Empty,
                    x.CreatedBy?.User?.DisplayName ?? string.Empty
                )
                ),
            new UserInfoDto(
                new UserDto(
                    x.LastModifiedBy?.User?.Id ?? string.Empty,
                    x.LastModifiedBy?.User?.DisplayName ?? string.Empty
                )
                ),
            new ParentReferenceDto(
                x.ParentReference?.DriveType ?? string.Empty,
                x.ParentReference?.DriveId ?? string.Empty,
                x.ParentReference?.Id ?? string.Empty,
                x.ParentReference?.Name ?? string.Empty,
                x.ParentReference?.Path ?? string.Empty,
                x.ParentReference?.SiteId ?? string.Empty
                ),
            new FileSystemInfoDto(
                x.FileSystemInfo?.CreatedDateTime.GetValueOrDefault() ?? DateTime.MinValue,
                x.FileSystemInfo?.LastModifiedDateTime.GetValueOrDefault() ?? DateTime.MinValue
                ),
            new SharedInfoDto(
                x.Shared?.Scope ?? string.Empty
                ),
            x.AdditionalData != null && x.AdditionalData.ContainsKey("@microsoft.graph.downloadUrl") ? x.AdditionalData["@microsoft.graph.downloadUrl"]?.ToString() : null,
            x.Folder != null ? new FolderInfoDto(
                x.Folder.ChildCount.GetValueOrDefault()
                ) : null,
            x.File != null ? new FileInfoDto(
                x.File.MimeType ?? string.Empty
                ) : null
            )
           ).ToList();
        return items;
    }
}
