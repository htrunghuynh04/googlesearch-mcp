//using Microsoft.Graph;
//using ModelContextProtocol.Server;
//using System.ComponentModel;
//using System.ComponentModel.DataAnnotations;
//using System.Text;
//using UglyToad.PdfPig;
//using UglyToad.PdfPig.Content;
//using ClosedXML.Excel;
//using System.Data;
//using System.Text.Json;

//namespace Nois.Mcp.Api.Endpoints;

//public record ReadFileContentReq(
//    [Description("SiteId from special site with format required. eg: cotoso.sharepoint.com,7f1f8de9-8ca1-4b82-8111-6261486f1372,424a4918-6334-4537-af71-5bf19378ca2a")]
//    [Required]
//    string SiteId,
//    [Description("ID of the file to read")]
//    [Required]
//    string DriveItemId,
//    [Description("Preferred encoding for text files. Default is UTF-8")]
//    string Encoding = "utf-8"
//);
//public record EditFileReq(
//    string SiteId,
//    string DriveItemId,
//    string FileType,
//    string Operation,   // "update-cell", "append-text", "replace-text", "prepend-text", "insert-text", "remove-lines", "format-alignment", "insert-row", "delete-row", "insert-column", "delete-column", "format-border", "format-color"
//    string? SheetName,
//    string? Range,      // "B2", "A1:C3", "D:F" for entire columns, or position for text operations
//    string? Find,
//    string? Replace,
//    string? NewValue
//);
//public record FileContentResult(
//    bool Success,
//    string Message,
//    string? FileName,
//    string? FileType,
//    long? FileSize,
//    string? Content,
//    string? DownloadUrl
//)
//{
//    public static FileContentResult Fail(string message) =>
//        new(false, message, null, null, null, null, null);
    
//    public static FileContentResult CreateSuccess(string fileName, string fileType, long? fileSize, string? content, string? downloadUrl) =>
//        new(true, "File content read successfully", fileName, fileType, fileSize, content, downloadUrl);
//}
//public record EditFileResult(
//    bool Success,
//    string Message,
//    string? UpdatedContentPreview
//);
//public record FileAnalysisResult(
//    bool Success,
//    string Message,
//    string? FileName,
//    string? FileType,
//    long? FileSize,
//    string? Content,
//    string? DownloadUrl
//);


//[McpServerToolType]
//public static class FileReadingTools
//{
//    [McpServerTool, Description("Reads the text content from a SharePoint file. Supports various file formats including text files, CSV, JSON, XML, HTML, Markdown, and other readable text-based formats. For binary formats like PDF or Office documents, it returns the content if readable or provides download information.")]
//    public static async Task<FileContentResult> ReadFileContent(
//        ReadFileContentReq input, 
//        GraphServiceClient client)
//    {
//        try
//        {
//            var driveId = await GetDriveIdAsync(input.SiteId, client);
//            var fileItem = await client.Drives[driveId].Items[input.DriveItemId].GetAsync();

//            if (fileItem?.File == null)
//            {
//                return FileContentResult.Fail("The DriveItem is not a file.");
//            }

//            var fileType = fileItem.File.MimeType ?? "Unknown";
//            var downloadUrl = GetDownloadUrl(fileItem);

//            string? content = await ExtractContentBasedOnType(
//                fileItem, 
//                driveId, 
//                input, 
//                client, 
//                downloadUrl
//            );

//            return FileContentResult.CreateSuccess(
//                fileName: fileItem.Name,
//                fileType: fileType,
//                fileSize: fileItem.Size,
//                content: content,
//                downloadUrl: downloadUrl
//            );
//        }
//        catch (Exception ex)
//        {
//            return FileContentResult.Fail($"Unhandled error: {ex.Message}");
//        }
//    }
//    [McpServerTool, Description("Allows LLM to safely edit a SharePoint file (text or Excel).")]
//    public static async Task<EditFileResult> EditFileContent(
//        EditFileReq input,
//        GraphServiceClient client)
//    {
//        try
//        {
//            var driveId = await GetDriveIdAsync(input.SiteId, client);

//            // Step 1 — Fetch file
//            var originalStream = await client.Drives[driveId].Items[input.DriveItemId].Content.GetAsync();
//            if (originalStream == null)
//                return new(false, "Cannot open file content", null);

//            byte[] updatedBytes;

//            // Step 2 — Branch by file type
//            if (input.FileType == "excel" || input.FileType == "sheet")
//            {
//                updatedBytes = input.Operation switch
//                {
//                    "format-alignment" => ExcelEditHelper.FormatAlignment(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        range: input.Range!,
//                        alignment: input.NewValue! // "center", "left", "right", "top", "bottom", "middle", ""
//                    ),
//                    "format-border" => ExcelEditHelper.SetBorder(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        range: input.Range!,
//                        borderStyle: input.NewValue! // "thin", "thick", "medium", "double", "dotted", "dashed", "none", "all-thin", "outside-thick"
//                    ),
//                    "format-color" => ExcelEditHelper.SetCellColor(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        range: input.Range!,
//                        colorStyle: input.NewValue! // "bg-red", "bg-blue", "font-white", "bg-yellow,font-black"
//                    ),
//                    "insert-row" => ExcelEditHelper.InsertRow(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        rowIndex: int.Parse(input.Range!)
//                    ),
//                    "delete-row" => ExcelEditHelper.DeleteRow(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        rowIndex: int.Parse(input.Range!)
//                    ),
//                    "insert-column" => ExcelEditHelper.InsertColumn(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        columnIndex: int.Parse(input.Range!)
//                    ),
//                    "delete-column" => ExcelEditHelper.DeleteColumn(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        columnIndex: int.Parse(input.Range!)
//                    ),
//                    "updateCell" or _ => ExcelEditHelper.UpdateCell(
//                        stream: originalStream,
//                        sheetName: input.SheetName!,
//                        range: input.Range!,
//                        newValue: input.NewValue!
//                    )
//                };
//            }
//            else if (input.FileType == "text")
//            {
//                using var reader = new StreamReader(originalStream);
//                var content = await reader.ReadToEndAsync();

//                var newContent = input.Operation switch
//                {
//                    "replace-text" => TextEditHelper.Replace(content, input.Find!, input.Replace!),
//                    "append-text" => TextEditHelper.Append(content, input.NewValue!),
//                    "prepend-text" => TextEditHelper.Prepend(content, input.NewValue!),
//                    "insert-text" => TextEditHelper.InsertAt(content, int.Parse(input.Range ?? "0"), input.NewValue!),
//                    "remove-lines" => input.Range?.Contains("-") == true 
//                        ? TextEditHelper.RemoveLines(content, 
//                            int.Parse(input.Range.Split('-')[0]), 
//                            int.Parse(input.Range.Split('-')[1]))
//                        : content,
//                    _ => throw new Exception("Unsupported text operation")
//                };

//                updatedBytes = Encoding.UTF8.GetBytes(newContent);
//            }
//            else
//            {
//                return new(false, $"File type {input.FileType} is not editable", null);
//            }

//            // Step 3 — Upload back to SharePoint
//            using var uploadStream = new MemoryStream(updatedBytes);
//            await client.Drives[driveId].Items[input.DriveItemId].Content.PutAsync(uploadStream);

//            // Step 4 — Return result
//            return new(
//                Success: true,
//                Message: "File updated successfully",
//                UpdatedContentPreview: input.FileType == "text"
//                    ? Encoding.UTF8.GetString(updatedBytes).Substring(0, Math.Min(500, updatedBytes.Length))
//                    : "[Excel file updated]"
//            );
//        }
//        catch (Exception ex)
//        {
//            return new(false, $"Error while editing file: {ex.Message}", null);
//        }
//    }
//    // -----------------------------
//    // Helpers
//    // -----------------------------

//    private static async Task<string> GetDriveIdAsync(string siteId, GraphServiceClient client)
//    {
//        var drive = await client.Sites[siteId].Drive.GetAsync();
//        return drive.Id!;
//    }

//    private static string? GetDownloadUrl(Microsoft.Graph.Models.DriveItem item)
//    {
//        if (item.AdditionalData != null &&
//            item.AdditionalData.TryGetValue("@microsoft.graph.downloadUrl", out var url))
//        {
//            return url?.ToString();
//        }
//        return null;
//    }

//    private static async Task<string?> ExtractContentBasedOnType(
//        Microsoft.Graph.Models.DriveItem item,
//        string driveId,
//        ReadFileContentReq input,
//        GraphServiceClient client,
//        string? downloadUrl)
//    {
//        var fileType = item.File.MimeType ?? "";

//        try
//        {
//            using var stream = await client.Drives[driveId].Items[input.DriveItemId].Content.GetAsync();
//            if (stream == null) return null;

//            if (fileType.Contains("pdf", StringComparison.OrdinalIgnoreCase))
//                return await ReadPdfAsync(stream);

//            if (fileType.Contains("spreadsheet", StringComparison.OrdinalIgnoreCase) ||
//                fileType.Contains("excel", StringComparison.OrdinalIgnoreCase) ||
//                fileType.EndsWith("sheet", StringComparison.OrdinalIgnoreCase) ||
//                item.Name.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
//                return await ReadExcelAsync(stream);
            
//            if (MimeTypeHelper.IsTextReadable(fileType))
//                return await ReadTextAsync(stream, input.Encoding);

//            return null;
//        }
//        catch
//        {
//            return await TryFallbackDownloadAsync(downloadUrl);
//        }
//    }

//    private static async Task<string?> ReadPdfAsync(Stream input)
//    {
//        using var ms = new MemoryStream();
//        await input.CopyToAsync(ms);
//        ms.Position = 0;

//        return await Task.FromResult(ReadPdf(ms));
//    }

//    private static async Task<string?> ReadExcelAsync(Stream input)
//    {
//    using var ms = new MemoryStream();
//    await input.CopyToAsync(ms);
//    ms.Position = 0;

//    return await Task.FromResult(ReadExcel(ms));
//    }

//    private static async Task<string?> ReadTextAsync(Stream input, string encoding)
//    {
//        using var reader = new StreamReader(input, Encoding.GetEncoding(encoding));
//        return await reader.ReadToEndAsync();
//    }

//    private static async Task<string?> TryFallbackDownloadAsync(string? url)
//    {
//        if (string.IsNullOrEmpty(url)) return null;

//        using var http = new HttpClient();
//        try
//        {
//            return await http.GetStringAsync(url);
//        }
//        catch
//        {
//            return null;
//        }
//    }
//    public static class MimeTypeHelper
//    {
//        private static readonly string[] AllowedTextMimeTypes =
//        {
//            "text/",
//            "application/json",
//            "application/xml",
//            "text/html",
//            "text/plain",
//            "text/markdown",
//            "application/javascript",
//        };

//        public static bool IsTextReadable(string mimeType)
//        {
//            if (string.IsNullOrEmpty(mimeType)) return false;

//            return AllowedTextMimeTypes
//                .Any(type => mimeType.StartsWith(type, StringComparison.OrdinalIgnoreCase));
//        }
//    }
//    public static string ReadPdf(Stream stream, int maxPages = int.MaxValue)
//    {
//        // Đảm bảo stream ở vị trí bắt đầu
//        stream.Position = 0;
//        using var doc = PdfDocument.Open(stream);
//        var sb = new StringBuilder();

//        // Lặp qua từng trang PDF
//        for (int i = 1; i <= doc.NumberOfPages && i <= maxPages; i++)
//        {
//            var page = doc.GetPage(i);

//            // Lấy text chính
//            var text = page.Text;

//            // Nếu thất bại → fallback lấy chữ từ từng Letter
//            if (string.IsNullOrWhiteSpace(text))
//                text = ReadPageFallback(page);

//            if (!string.IsNullOrWhiteSpace(text))
//            {
//                sb.AppendLine(text);
//                sb.AppendLine();
//            }
//        }
//        return sb.ToString();
//    }
//    private static string ReadPageFallback(Page page)
//        => string.Join(" ", page.Letters.Select(l => l.Value));

//    public static string ReadExcel(Stream stream)
//    {
//        using var workbook = new XLWorkbook(stream);
//        var result = new Dictionary<string, object>();

//        foreach (var sheet in workbook.Worksheets)
//        {
//            var table = new List<Dictionary<string, object?>>();
//            var rows = sheet.RangeUsed()?.RowsUsed();

//            if (rows == null) continue;

//            // Lấy header
//            var headerRow = rows.First();
//            var headers = headerRow.Cells().Select(c => c.GetString()).ToList();

//            // Lấy data
//            foreach (var row in rows.Skip(1))
//            {
//                var rowData = new Dictionary<string, object?>();
//                int colIndex = 0;
//                foreach (var cell in row.Cells(c => true))
//                {
//                    var header = headers[colIndex];
//                    var value = cell.Value;
//                    rowData[header] = value.ToString();
//                    colIndex++;
//                }
//                table.Add(rowData);
//            }

//            result[sheet.Name] = table;
//        }
//        return JsonSerializer.Serialize(result, new JsonSerializerOptions
//        {
//            WriteIndented = false
//        });
//    }
//public static class ExcelEditHelper
//{
//    private static (XLWorkbook workbook, IXLWorksheet sheet) LoadWorkbook(Stream stream, string sheetName)
//    {
//        // Copy stream to memory first to avoid stream position issues
//        var ms = new MemoryStream();
//        stream.CopyTo(ms);
//        ms.Position = 0;
        
//        var workbook = new XLWorkbook(ms);
//        var sheet = workbook.Worksheet(sheetName);
        
//        return (workbook, sheet);
//    }

//    public static byte[] UpdateCell(Stream stream, string sheetName, string range, string newValue)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Validate that the range exists and get the cell
//            var cell = sheet.Range(range).FirstCell();
            
//            if (cell == null)
//            {
//                throw new InvalidOperationException($"Cell at range '{range}' not found in worksheet '{sheetName}'");
//            }

//            // Set the new value
//            cell.Value = newValue;

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"UpdateCell failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    public static byte[] FormatAlignment(Stream stream, string sheetName, string range, string alignment)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Handle column range format like "D:F"
//            if (range.Contains(":") && range.Split(':').Length == 2)
//            {
//                var rangeParts = range.Split(':');
//                var startCol = rangeParts[0];
//                var endCol = rangeParts[1];
                
//                // Check if it's a column range (single letters)
//                if (startCol.Length == 1 && endCol.Length == 1 && 
//                    char.IsLetter(startCol[0]) && char.IsLetter(endCol[0]))
//                {
//                    // This is a column range like "D:F"
//                    // Convert to specific range
//                    range = $"{startCol}1:{endCol}100";
//                }
//            }
            
//            var rangeToFormat = sheet.Range(range);

//            // Parse combined alignment (e.g., "top-left", "bottom-right")
//            var alignmentParts = alignment.ToLower().Split('-');
            
//            // Default values
//            var horizontalAlignment = XLAlignmentHorizontalValues.Center;
//            var verticalAlignment = XLAlignmentVerticalValues.Center;
            
//            // Parse alignment values
//            foreach (var part in alignmentParts)
//            {
//                switch (part)
//                {
//                    // Horizontal alignments
//                    case "left":
//                        horizontalAlignment = XLAlignmentHorizontalValues.Left;
//                        break;
//                    case "center" when alignmentParts.Length == 1:
//                        horizontalAlignment = XLAlignmentHorizontalValues.Center;
//                        verticalAlignment = XLAlignmentVerticalValues.Center;
//                        break;
//                    case "right":
//                        horizontalAlignment = XLAlignmentHorizontalValues.Right;
//                        break;
                    
//                    // Vertical alignments
//                    case "top":
//                        verticalAlignment = XLAlignmentVerticalValues.Top;
//                        break;
//                    case "bottom":
//                        verticalAlignment = XLAlignmentVerticalValues.Bottom;
//                        break;
//                    case "middle":
//                        verticalAlignment = XLAlignmentVerticalValues.Center;
//                        break;
//                }
//            }

//            rangeToFormat.Style.Alignment.Horizontal = horizontalAlignment;
//            rangeToFormat.Style.Alignment.Vertical = verticalAlignment;

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"FormatAlignment failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    public static byte[] InsertRow(Stream stream, string sheetName, int rowIndex)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Insert row at specified index (1-based)
//            sheet.Row(rowIndex).InsertRowsAbove(1);

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"InsertRow failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    public static byte[] DeleteRow(Stream stream, string sheetName, int rowIndex)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Validate row exists
//            if (rowIndex < 1 || rowIndex > sheet.LastRowUsed()?.RowNumber())
//            {
//                throw new InvalidOperationException($"Row {rowIndex} does not exist or is out of range in worksheet '{sheetName}'");
//            }
            
//            // Delete the specified row
//            sheet.Row(rowIndex).Delete();

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"DeleteRow failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    public static byte[] InsertColumn(Stream stream, string sheetName, int columnIndex)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Insert column at specified index (1-based)
//            sheet.Column(columnIndex).InsertColumnsBefore(1);

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"InsertColumn failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    public static byte[] DeleteColumn(Stream stream, string sheetName, int columnIndex)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Validate column exists
//            if (columnIndex < 1 || columnIndex > sheet.LastColumnUsed()?.ColumnNumber())
//            {
//                throw new InvalidOperationException($"Column {columnIndex} does not exist or is out of range in worksheet '{sheetName}'");
//            }
            
//            // Delete the specified column
//            sheet.Column(columnIndex).Delete();

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"DeleteColumn failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    public static byte[] SetBorder(Stream stream, string sheetName, string range, string borderStyle)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Handle column range format like "D:F"
//            if (range.Contains(":") && range.Split(':').Length == 2)
//            {
//                var rangeParts = range.Split(':');
//                var startCol = rangeParts[0];
//                var endCol = rangeParts[1];
                
//                // Check if it's a column range (single letters)
//                if (startCol.Length == 1 && endCol.Length == 1 && 
//                    char.IsLetter(startCol[0]) && char.IsLetter(endCol[0]))
//                {
//                    // This is a column range like "D:F"
//                    // Convert to specific range
//                    range = $"{startCol}1:{endCol}100";
//                }
//            }
            
//            var rangeToFormat = sheet.Range(range);

//            // Parse border style and apply
//            switch (borderStyle.ToLower())
//            {
//                case "thin":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
//                    break;
//                case "thick":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Thick;
//                    break;
//                case "medium":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Medium;
//                    break;
//                case "double":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Double;
//                    break;
//                case "dotted":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Dotted;
//                    break;
//                case "dashed":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Dashed;
//                    break;
//                case "none":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.None;
//                    rangeToFormat.Style.Border.InsideBorder = XLBorderStyleValues.None;
//                    break;
//                case "all-thin":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
//                    rangeToFormat.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
//                    break;
//                case "all-thick":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Thick;
//                    rangeToFormat.Style.Border.InsideBorder = XLBorderStyleValues.Thick;
//                    break;
//                case "all-medium":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Medium;
//                    rangeToFormat.Style.Border.InsideBorder = XLBorderStyleValues.Medium;
//                    break;
//                case "outside-thin":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
//                    break;
//                case "outside-thick":
//                    rangeToFormat.Style.Border.OutsideBorder = XLBorderStyleValues.Thick;
//                    break;
//                case "inside-thin":
//                    rangeToFormat.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
//                    break;
//                case "inside-thick":
//                    rangeToFormat.Style.Border.InsideBorder = XLBorderStyleValues.Thick;
//                    break;
//                default:
//                    throw new ArgumentException($"Unsupported border style: {borderStyle}");
//            }

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"SetBorder failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    public static byte[] SetCellColor(Stream stream, string sheetName, string range, string colorStyle)
//    {
//        try
//        {
//            var (workbook, sheet) = LoadWorkbook(stream, sheetName);
            
//            // Handle column range format like "D:F"
//            if (range.Contains(":") && range.Split(':').Length == 2)
//            {
//                var rangeParts = range.Split(':');
//                var startCol = rangeParts[0];
//                var endCol = rangeParts[1];
                
//                // Check if it's a column range (single letters)
//                if (startCol.Length == 1 && endCol.Length == 1 && 
//                    char.IsLetter(startCol[0]) && char.IsLetter(endCol[0]))
//                {
//                    // This is a column range like "D:F"
//                    // Convert to specific range
//                    range = $"{startCol}1:{endCol}100";
//                }
//            }
            
//            var rangeToFormat = sheet.Range(range);

//            // Parse color style - can be multiple comma-separated values
//            var colorCommands = colorStyle.ToLower().Split(',');
            
//            foreach (var command in colorCommands)
//            {
//                var trimmedCommand = command.Trim();
                
//                if (trimmedCommand.StartsWith("bg-"))
//                {
//                    // Background color
//                    var colorName = trimmedCommand.Substring(3);
//                    rangeToFormat.Style.Fill.BackgroundColor = GetXLColor(colorName);
//                }
//                else if (trimmedCommand.StartsWith("font-"))
//                {
//                    // Font color
//                    var colorName = trimmedCommand.Substring(5);
//                    rangeToFormat.Style.Font.FontColor = GetXLColor(colorName);
//                }
//                else
//                {
//                    throw new ArgumentException($"Invalid color command: {trimmedCommand}. Use 'bg-colorname' or 'font-colorname'");
//                }
//            }

//            using var output = new MemoryStream();
//            workbook.SaveAs(output);

//            return output.ToArray();
//        }
//        catch (Exception ex)
//        {
//            throw new Exception($"SetCellColor failed: {ex.Message} | InnerException: {ex.InnerException?.Message}", ex);
//        }
//    }

//    private static XLColor GetXLColor(string colorName)
//    {
//        return colorName switch
//        {
//            // Basic colors
//            "red" => XLColor.Red,
//            "blue" => XLColor.Blue,
//            "green" => XLColor.Green,
//            "yellow" => XLColor.Yellow,
//            "orange" => XLColor.Orange,
//            "purple" => XLColor.Purple,
//            "pink" => XLColor.Pink,
//            "cyan" => XLColor.Cyan,
//            "magenta" => XLColor.Magenta,
//            "lime" => XLColor.Lime,
            
//            // Neutral colors
//            "black" => XLColor.Black,
//            "white" => XLColor.White,
//            "gray" => XLColor.Gray,
//            "grey" => XLColor.Gray,
//            "darkgray" => XLColor.DarkGray,
//            "lightgray" => XLColor.LightGray,
            
//            // Extended colors
//            "darkred" => XLColor.DarkRed,
//            "darkblue" => XLColor.DarkBlue,
//            "darkgreen" => XLColor.DarkGreen,
//            "lightblue" => XLColor.LightBlue,
//            "lightgreen" => XLColor.LightGreen,
//            "lightyellow" => XLColor.LightYellow,
            
//            // Professional colors
//            "navy" => XLColor.Navy,
//            "maroon" => XLColor.Maroon,
//            "olive" => XLColor.Olive,
//            "teal" => XLColor.Teal,
//            "silver" => XLColor.Silver,
            
//            // Clear/transparent
//            "none" or "transparent" or "clear" => XLColor.NoColor,
            
//            _ => throw new ArgumentException($"Unsupported color: {colorName}")
//        };
//    }
//}
//public static class TextEditHelper
//{
//    public static string Replace(string content, string find, string replace)
//    {
//        if (string.IsNullOrEmpty(content))
//            throw new ArgumentException("Content cannot be null or empty", nameof(content));
        
//        if (string.IsNullOrEmpty(find))
//            throw new ArgumentException("Find string cannot be null or empty", nameof(find));
        
//        if (replace == null)
//            replace = string.Empty;
            
//        return content.Replace(find, replace);
//    }
    
//    public static string Append(string content, string value)
//    {
//        if (content == null)
//            content = string.Empty;
            
//        if (string.IsNullOrEmpty(value))
//            return content;
            
//        // Use Environment.NewLine for cross-platform compatibility
//        return content + Environment.NewLine + value;
//    }
    
//    public static string Prepend(string content, string value)
//    {
//        if (content == null)
//            content = string.Empty;
            
//        if (string.IsNullOrEmpty(value))
//            return content;
            
//        return value + Environment.NewLine + content;
//    }
    
//    public static string InsertAt(string content, int position, string value)
//    {
//        if (content == null)
//            content = string.Empty;
            
//        if (string.IsNullOrEmpty(value))
//            return content;
            
//        if (position < 0)
//            position = 0;
//        else if (position > content.Length)
//            position = content.Length;
            
//        return content.Insert(position, value);
//    }
    
//    public static string RemoveLines(string content, int startLine, int endLine)
//    {
//        if (string.IsNullOrEmpty(content))
//            return content;
            
//        var lines = content.Split(new[] { Environment.NewLine, "\n", "\r\n" }, StringSplitOptions.None);
        
//        if (startLine < 0 || startLine >= lines.Length)
//            return content;
            
//        if (endLine < startLine || endLine >= lines.Length)
//            endLine = lines.Length - 1;
            
//        var result = new List<string>();
//        for (int i = 0; i < lines.Length; i++)
//        {
//            if (i < startLine || i > endLine)
//                result.Add(lines[i]);
//        }
        
//        return string.Join(Environment.NewLine, result);
//    }
//}
//}
