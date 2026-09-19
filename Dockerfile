# Multi-stage build for .NET 10 LTS Web API from repository root
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY backend/DeskFlow.Api/DeskFlow.Api.csproj backend/DeskFlow.Api/
RUN dotnet restore backend/DeskFlow.Api/DeskFlow.Api.csproj

# Copy source code and build production release
COPY backend/DeskFlow.Api/ backend/DeskFlow.Api/
WORKDIR /src/backend/DeskFlow.Api
RUN dotnet publish DeskFlow.Api.csproj -c Release -o /app/publish

# Production runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_HTTP_PORTS=5000
ENV PORT=5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "DeskFlow.Api.dll"]
