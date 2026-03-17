namespace Nois.Mcp.Application;

public record DataAccessError(ErrorCode Code, string Message)
{
    public static DataAccessError NotFound() => new(ErrorCode.NotFound, "The requested entity was not found.");
    public static DataAccessError NotFound(string message) => new(ErrorCode.NotFound, message);

    public static DataAccessError ValidationFailed() => new(ErrorCode.ValidationFailed, "Validation failed.");
    public static DataAccessError ValidationFailed(string message) => new(ErrorCode.ValidationFailed, message);

    public static DataAccessError Conflict() => new(ErrorCode.Conflict, "The operation would result in a conflict.");
    public static DataAccessError Conflict(string message) => new(ErrorCode.Conflict, message);

    public static DataAccessError DatabaseError() => new(ErrorCode.DatabaseError, "A database error occurred.");
    public static DataAccessError DatabaseError(string message) => new(ErrorCode.DatabaseError, message);
}

public enum ErrorCode
{
    NotFound,
    ValidationFailed,
    Conflict,
    DatabaseError
}
