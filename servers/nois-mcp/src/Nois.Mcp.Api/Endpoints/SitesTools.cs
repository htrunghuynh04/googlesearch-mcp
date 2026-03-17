using Microsoft.Graph;
using ModelContextProtocol.Server;
using Nois.Mcp.Infrastructure.Settings;
using System.ComponentModel;

namespace Nois.Mcp.Api.Endpoints;

public record SiteDto(
    string Id,
    string Name,
    string DisplayName,
    string? Description,
    DateTimeOffset? CreatedDateTime,
    DateTimeOffset? LastModifiedDateTime,
    IDictionary<string, object>? AdditionalData
);


[McpServerToolType]
public static class SitesTools
{
    [McpServerTool, Description("Retrieves a list of available SharePoint sites. Use this tool when you need to discover or enumerate SharePoint sites in the current environment, such as before navigating to drives or folders. No inputs are required; it returns a list of site objects.")]
    public static async Task<List<SiteDto>> GetSites(IConfiguration configuration, GraphServiceClient client)
    {
        var graphConfig = configuration.GetSection("AzureAD").Get<AzureAdSettings>();
        var supportSites = graphConfig.SupportSites.Split(",")
            .Select(site => site.Trim())
            .Where(site => !string.IsNullOrEmpty(site))
            .ToList();
        var sitesResponse = await client.Sites
            .GetAsync();
        if (sitesResponse?.Value == null || sitesResponse.Value.Count == 0)
            return new List<SiteDto>();

        var sites = sitesResponse.Value.ToList().Select(x => new SiteDto
        (
            x.Id,
            x.Name,
            x.DisplayName,
            x.Description,
            x.CreatedDateTime,
            x.LastModifiedDateTime,
            x.AdditionalData
        )).ToList();
        
        if (supportSites.Count > 0)
        {
            sites = sites.Where(site => supportSites.Contains(site.DisplayName)).ToList();
        }

        return sites;
    }
}
