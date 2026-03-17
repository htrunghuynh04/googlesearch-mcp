using Microsoft.Graph;
using Microsoft.Graph.Models;

namespace Nois.Mcp.Infrastructure.Features.Sites.DataServices;

public class ShareSiteDataService(GraphServiceClient _graph)
{
    public async Task<List<Site>> GetSiteCollectionAsync()
    {
        var siteCollectionResponse = await _graph.Sites
            .GetAsync();
        if (siteCollectionResponse?.Value == null || siteCollectionResponse.Value.Count == 0)
        {
            return new List<Site>();
        }

        var sites = siteCollectionResponse.Value.ToList();
       
        return sites;
    }
}
