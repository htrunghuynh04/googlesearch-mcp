using Mapster;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Nois.Mcp.Api.Services;
using Nois.Mcp.Infrastructure;
using Serilog;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
//builder.Services.AddOpenApi();
JsonSerializerOptions options = new JsonSerializerOptions(JsonSerializerOptions.Web)
{
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
};

builder.Services.AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly(null,options);



Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .CreateLogger();

builder.Host.UseSerilog();

//builder.Services.AddOpenTelemetry()
//    .UseAzureMonitor()
//    .WithTracing(tracing => tracing
//        .AddAspNetCoreInstrumentation()
//        .AddHttpClientInstrumentation()
//        .AddEntityFrameworkCoreInstrumentation())
//    .ConfigureResource(r => r.AddService("Pxp"));

if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddUserSecrets<Program>();
}
builder.Services.AddMcpInfrastructure(builder.Configuration);
builder.Services.AddSingleton<IFileContentExtractorService, FileContentExtractorService>();

// Configure Mapster mappings
TypeAdapterConfig.GlobalSettings.Default.IgnoreNullValues(true);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    //app.MapSampleDataEndpoints();
}

app.UseExceptionHandler(c =>
{
    c.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        if (feature != null)
        {
            var problemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = feature.Error.Message,
                Detail = feature.Error.StackTrace
            };
            context.Response.StatusCode = problemDetails.Status.Value;
            await context.Response.WriteAsJsonAsync(problemDetails);
        }
    });
});

//app.UseHttpsRedirection();
app.MapMcp("/mcp");


app.Run();

