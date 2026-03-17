using Microsoft.Graph;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Nois.Mcp.Api.Services;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace Nois.Mcp.Api.Endpoints;

#region Request/Response Models

public record ExtractFileContentReq(
    [Description("SiteId from SharePoint site")]
    [Required]
    string SiteId,
    [Description("DriveItemId of the file to extract content from")]
    [Required]
    string DriveItemId
);

public record ExtractFileContentResult(
    bool Success,
    string FileName,
    string FileExtension,
    long FileSize,
    string Content
);

#endregion

[McpServerToolType]
public static class FileExtractTools
{
    [McpServerTool, Description("Extracts text content from a SharePoint file. Supports Word (.docx), PDF (.pdf), Excel (.xlsx), CSV (.csv), and plain text files (.txt, .json, .xml, .md, .html, .log, .yaml, .yml).")]
    public static async Task<ExtractFileContentResult> ExtractFileContent(
        ExtractFileContentReq input,
        GraphServiceClient client,
        IFileContentExtractorService extractor)
    {
        try
        {
            var driveRootRes = await client.Sites[input.SiteId].Drive.GetAsync();
            var driveId = driveRootRes.Id;

            // Get file metadata
            var fileItem = await client.Drives[driveId].Items[input.DriveItemId].GetAsync();

            var fileName = fileItem?.Name ?? "Unknown";
            var fileExtension = Path.GetExtension(fileName);
            var fileSize = fileItem?.Size ?? 0;

            // Validate file extension
            if (!extractor.IsSupported(fileExtension))
            {
                throw McpExceptionExtensions.CreateValidationException(
                    $"Unsupported file type: {fileExtension}. Supported types: {extractor.GetSupportedExtensionsString()}");
            }

            // Download file content
            var fileStream = await client.Drives[driveId].Items[input.DriveItemId].Content.GetAsync();

            if (fileStream == null)
            {
                throw McpExceptionExtensions.CreateNotFoundException("File content", input.DriveItemId);
            }

            // Extract text content
            var content = await extractor.ExtractTextContentAsync(fileStream, fileExtension);

            return new ExtractFileContentResult(
                Success: true,
                FileName: fileName,
                FileExtension: fileExtension,
                FileSize: fileSize,
                Content: content
            );
        }
        catch (McpException)
        {
            throw;
        }
        catch (Microsoft.Graph.Models.ODataErrors.ODataError odataError)
        {
            var errorCode = odataError.Error?.Code ?? "Unknown";
            var errorMessage = odataError.Error?.Message ?? "No error message provided";
            throw McpExceptionExtensions.CreateGraphApiException(
                "Error extracting file content",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException("Error extracting file content", ex);
        }
    }
}
