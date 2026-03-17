using ClosedXML.Excel;
using DocumentFormat.OpenXml.Packaging;
using System.Text;
using UglyToad.PdfPig;

namespace Nois.Mcp.Api.Services;

public class FileContentExtractorService : IFileContentExtractorService
{
    public HashSet<string> SupportedExtensions { get; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ".docx", ".pdf", ".xlsx", ".csv", ".txt", ".json", ".xml", ".md", ".html", ".htm", ".log", ".yaml", ".yml"
    };

    public bool IsSupported(string extension) => SupportedExtensions.Contains(extension);

    public string GetSupportedExtensionsString() => string.Join(", ", SupportedExtensions);

    public async Task<string> ExtractTextContentAsync(Stream stream, string extension)
    {
        using var memoryStream = new MemoryStream();
        await stream.CopyToAsync(memoryStream);
        memoryStream.Position = 0;

        return extension.ToLowerInvariant() switch
        {
            ".docx" => ExtractWordText(memoryStream),
            ".pdf" => ExtractPdfText(memoryStream),
            ".xlsx" => ExtractExcelText(memoryStream),
            ".csv" => await ExtractPlainTextAsync(memoryStream),
            _ => await ExtractPlainTextAsync(memoryStream)
        };
    }

    private static string ExtractWordText(Stream stream)
    {
        var sb = new StringBuilder();

        using var doc = WordprocessingDocument.Open(stream, false);
        var body = doc.MainDocumentPart?.Document?.Body;

        if (body != null)
        {
            foreach (var paragraph in body.ChildElements)
            {
                var text = paragraph.InnerText;
                sb.AppendLine(text);
            }
        }

        return sb.ToString();
    }

    private static string ExtractPdfText(Stream stream)
    {
        var sb = new StringBuilder();

        using var document = PdfDocument.Open(stream);
        foreach (var page in document.GetPages())
        {
            var text = page.Text;
            sb.AppendLine(text);
        }

        return sb.ToString();
    }

    private static string ExtractExcelText(Stream stream)
    {
        var sb = new StringBuilder();

        using var workbook = new XLWorkbook(stream);
        foreach (var worksheet in workbook.Worksheets)
        {
            sb.AppendLine($"[Sheet: {worksheet.Name}]");

            var usedRange = worksheet.RangeUsed();
            if (usedRange != null)
            {
                foreach (var row in usedRange.Rows())
                {
                    var cells = row.Cells().Select(c => c.GetString());
                    sb.AppendLine(string.Join("\t", cells));
                }
            }
        }

        return sb.ToString();
    }

    private static async Task<string> ExtractPlainTextAsync(Stream stream)
    {
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync();
    }
}
