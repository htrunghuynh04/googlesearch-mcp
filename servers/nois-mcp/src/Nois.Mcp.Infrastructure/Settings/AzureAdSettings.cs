namespace Nois.Mcp.Infrastructure.Settings;

public class AzureAdSettings
{
    public string Instance { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string Scopes { get; set; } = string.Empty;
    public string SupportSites { get; set; } = string.Empty;
}
