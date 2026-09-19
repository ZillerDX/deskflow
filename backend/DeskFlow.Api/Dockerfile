# Multi-stage build for .NET 10 LTS Web API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["DeskFlow.Api.csproj", "./"]
RUN dotnet restore "DeskFlow.Api.csproj"
COPY . .
RUN dotnet publish "DeskFlow.Api.csproj" -c Release -o /app/publish

# Production runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_HTTP_PORTS=5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "DeskFlow.Api.dll"]
