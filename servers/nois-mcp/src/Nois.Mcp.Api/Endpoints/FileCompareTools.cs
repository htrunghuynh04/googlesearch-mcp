using DiffPlex;
using DiffPlex.DiffBuilder;
using DiffPlex.DiffBuilder.Model;
using Microsoft.Graph;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Nois.Mcp.Api.Services;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace Nois.Mcp.Api.Endpoints;

#region Request/Response Models

public record CompareFilesReq(
    [Description("SiteId from SharePoint site")]
    [Required]
    string SiteId,
    [Description("DriveItemId of the first file (source)")]
    [Required]
    string SourceDriveItemId,
    [Description("DriveItemId of the second file (target)")]
    [Required]
    string TargetDriveItemId
);

public record LineDifference(
    int LineNumber,
    string Type,
    string OldText,
    string NewText,
    List<string> Changes
);

public record CompareFilesResult(
    bool Success,
    string Summary,
    string SourceFileName,
    string TargetFileName,
    int TotalSourceLines,
    int TotalTargetLines,
    int AddedLines,
    int RemovedLines,
    int ModifiedLines,
    List<LineDifference> Differences
);

#endregion

[McpServerToolType]
public static class FileCompareTools
{
    [McpServerTool, Description("Compares two SharePoint files and returns line-by-line differences. Supports Word (.docx), PDF (.pdf), Excel (.xlsx), CSV (.csv), and plain text files (.txt, .json, .xml, .md, etc.).")]
    public static async Task<CompareFilesResult> CompareFiles(
        CompareFilesReq input,
        GraphServiceClient client,
        IFileContentExtractorService extractor)
    {
        try
        {
            var driveRootRes = await client.Sites[input.SiteId].Drive.GetAsync();
            var driveId = driveRootRes.Id;

            // Get file metadata for both files
            var sourceItem = await client.Drives[driveId].Items[input.SourceDriveItemId].GetAsync();
            var targetItem = await client.Drives[driveId].Items[input.TargetDriveItemId].GetAsync();

            var sourceFileName = sourceItem?.Name ?? "Unknown";
            var targetFileName = targetItem?.Name ?? "Unknown";

            // Validate file extensions
            var sourceExtension = Path.GetExtension(sourceFileName);
            var targetExtension = Path.GetExtension(targetFileName);

            if (!extractor.IsSupported(sourceExtension))
            {
                throw McpExceptionExtensions.CreateValidationException(
                    $"Unsupported file type for source file: {sourceExtension}. Supported types: {extractor.GetSupportedExtensionsString()}");
            }

            if (!extractor.IsSupported(targetExtension))
            {
                throw McpExceptionExtensions.CreateValidationException(
                    $"Unsupported file type for target file: {targetExtension}. Supported types: {extractor.GetSupportedExtensionsString()}");
            }

            // Download file contents
            var sourceStream = await client.Drives[driveId].Items[input.SourceDriveItemId].Content.GetAsync();
            var targetStream = await client.Drives[driveId].Items[input.TargetDriveItemId].Content.GetAsync();

            if (sourceStream == null)
            {
                throw McpExceptionExtensions.CreateNotFoundException("Source file content", input.SourceDriveItemId);
            }

            if (targetStream == null)
            {
                throw McpExceptionExtensions.CreateNotFoundException("Target file content", input.TargetDriveItemId);
            }

            // Extract text content from both files
            var sourceText = await extractor.ExtractTextContentAsync(sourceStream, sourceExtension);
            var targetText = await extractor.ExtractTextContentAsync(targetStream, targetExtension);

            // Compare the files
            var result = CompareTexts(sourceText, targetText, sourceFileName, targetFileName);

            return result;
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
                "Error comparing files",
                errorCode,
                errorMessage);
        }
        catch (Exception ex)
        {
            throw McpExceptionExtensions.CreateFromException("Error comparing files", ex);
        }
    }

    #region Comparison Logic

    private static CompareFilesResult CompareTexts(string sourceText, string targetText, string sourceFileName, string targetFileName)
    {
        var diffModel = new SideBySideDiffBuilder(new Differ()).BuildDiffModel(sourceText, targetText);
        var oldLines = diffModel.OldText.Lines;
        var newLines = diffModel.NewText.Lines;

        var differences = oldLines.Zip(newLines, (old, @new) => (old, @new))
            .Where(pair => pair.old.Type is not ChangeType.Unchanged || pair.@new.Type is not ChangeType.Unchanged)
            .Select(pair => new LineDifference(
                pair.old.Position ?? pair.@new.Position ?? 0,
                GetChangeType(pair.old.Type, pair.@new.Type),
                pair.old.Type != ChangeType.Imaginary ? pair.old.Text ?? string.Empty : string.Empty,
                pair.@new.Type != ChangeType.Imaginary ? pair.@new.Text ?? string.Empty : string.Empty,
                ExtractWordChanges(pair.old, pair.@new)
            ))
            .ToList();

        int addedCount = newLines.Count(l => l.Type == ChangeType.Inserted);
        int removedCount = oldLines.Count(l => l.Type == ChangeType.Deleted);
        int modifiedCount = oldLines.Count(l => l.Type == ChangeType.Modified);
        int totalSourceLines = oldLines.Count(l => l.Type != ChangeType.Imaginary);
        int totalTargetLines = newLines.Count(l => l.Type != ChangeType.Imaginary);

        return new CompareFilesResult(
            Success: true,
            Summary: differences.Count == 0 ? "Files are identical" : $"{addedCount} added, {removedCount} removed, {modifiedCount} modified",
            SourceFileName: sourceFileName,
            TargetFileName: targetFileName,
            TotalSourceLines: totalSourceLines,
            TotalTargetLines: totalTargetLines,
            AddedLines: addedCount,
            RemovedLines: removedCount,
            ModifiedLines: modifiedCount,
            Differences: differences
        );
    }

    private static string GetChangeType(ChangeType oldType, ChangeType newType) => (oldType, newType) switch
    {
        (ChangeType.Deleted, ChangeType.Imaginary) => ChangeType.Deleted.ToString(),
        (ChangeType.Imaginary, ChangeType.Inserted) => ChangeType.Inserted.ToString(),
        (ChangeType.Modified, ChangeType.Modified) => ChangeType.Modified.ToString(),
        _ => oldType.ToString()
    };

    private static List<string> ExtractWordChanges(DiffPiece old, DiffPiece @new)
    {
        var changes = new List<string>();

        // For modified lines, extract word-level changes from SubPieces
        if (old.Type == ChangeType.Modified && old.SubPieces?.Count > 0 && @new.SubPieces?.Count > 0)
        {
            var deleted = old.SubPieces
                .Where(p => p.Type == ChangeType.Deleted)
                .Select(p => p.Text)
                .Where(t => !string.IsNullOrWhiteSpace(t));

            var inserted = @new.SubPieces
                .Where(p => p.Type == ChangeType.Inserted)
                .Select(p => p.Text)
                .Where(t => !string.IsNullOrWhiteSpace(t));

            changes.AddRange(deleted.Zip(inserted, (d, i) => $"'{d}' → '{i}'"));
            changes.AddRange(deleted.Skip(inserted.Count()).Select(d => $"-'{d}'"));
            changes.AddRange(inserted.Skip(deleted.Count()).Select(i => $"+'{i}'"));
        }

        return changes;
    }

    #endregion
}
