namespace Nois.Mcp.Api.Services;

public interface IFileContentExtractorService
{
    HashSet<string> SupportedExtensions { get; }
    bool IsSupported(string extension);
    string GetSupportedExtensionsString();
    Task<string> ExtractTextContentAsync(Stream stream, string extension);
}
