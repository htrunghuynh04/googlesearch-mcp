using Optional;

namespace Nois.Mcp.Application;

public static class Extensions
{
    public static Option<T, TException> Filter<T, TException>(this Option<T, TException> o, bool condition, Func<T, TException> exceptionFactory)
    {
        if (exceptionFactory == null)
        {
            throw new ArgumentNullException("exceptionFactory");
        }

        return !o.HasValue || condition ?
            o : o.FlatMap(v => Option.None<T, TException>(exceptionFactory(v)));
    }

    public static T[] ArrayOfOne<T>(this T item) => new T[] { item };

    public static TResponse TMap<T, TResponse>(this T data, Func<T, TResponse> transform)
        => transform(data);

    public static Task<TResponse> TMapAsync<T, TResponse>(this T data, Func<T, Task<TResponse>> transformAsync)
        => transformAsync(data);

    public static async Task<TResponse> TMapAsync<T, TResponse>(this Task<T> data, Func<T, Task<TResponse>> transformAsync)
        => await transformAsync(await data);
}
