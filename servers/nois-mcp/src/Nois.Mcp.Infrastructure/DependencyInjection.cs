using Azure.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Graph;
using Nois.Mcp.Infrastructure.Settings;

namespace Nois.Mcp.Infrastructure;

public static class DependencyInjectionExtention
{
    public static IServiceCollection AddMcpInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Register infrastructure services here
        var graphConfig = configuration.GetSection("AzureAD").Get<AzureAdSettings>();


        var clientSecretCredential = new ClientSecretCredential(graphConfig.TenantId, graphConfig.ClientId, graphConfig.ClientSecret);

        services.AddSingleton<GraphServiceClient>(sp =>
        {
            return new GraphServiceClient(clientSecretCredential, graphConfig.Scopes.Split(","));
        });

        return services;
    }
}
