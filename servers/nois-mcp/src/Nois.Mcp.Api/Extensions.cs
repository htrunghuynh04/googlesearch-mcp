using Microsoft.AspNetCore.Mvc;
using Nois.Mcp.Application;
using System.Net;

namespace Nois.Mcp.Api;

public static class Extensions
{
    public static IResult ToProblemDetailsResult(this DataAccessError error)
    {
        return Results.Problem(new ProblemDetails
        {
            Title = error.Message,
            Status = error.GetStatusCode(),
            Detail = error.Message,
            Type = error.Code.ToString()
        });
    }

    internal static int GetStatusCode(this DataAccessError error)
    {
        return error.Code switch
        {
            ErrorCode.NotFound => (int)HttpStatusCode.NotFound,
            ErrorCode.ValidationFailed => (int)HttpStatusCode.BadRequest,
            ErrorCode.Conflict => (int)HttpStatusCode.Conflict,
            _ => (int)HttpStatusCode.InternalServerError
        };
    }
}