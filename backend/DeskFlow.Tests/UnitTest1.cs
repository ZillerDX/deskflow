using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace DeskFlow.Tests;

public class BookingIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public BookingIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetFloorMap_ReturnsDesksList()
    {
        var response = await _client.GetAsync("/api/floor-map");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var content = await response.Content.ReadFromJsonAsync<FloorMapResponseDto>();
        Assert.NotNull(content);
        Assert.NotEmpty(content.Desks);
        Assert.Contains(content.Desks, d => d.Code == "DESK-C1");
    }

    [Fact]
    public async Task Booking_SameDesk_Twice_Returns409Conflict()
    {
        // 1. Get employees and desks
        var desks = await _client.GetFromJsonAsync<List<DeskMapItemDto>>("/api/desks");
        var employees = await _client.GetFromJsonAsync<List<EmployeeDto>>("/api/employees");

        Assert.NotNull(desks);
        Assert.NotNull(employees);

        // Pick POD-01 for test date
        var targetDesk = desks.First(d => d.Code == "POD-01");
        var emp1 = employees[2]; // David
        var emp2 = employees[3]; // Priya
        var testDate = DateOnly.FromDateTime(DateTime.Today.AddDays(7));

        var req1 = new CreateBookingRequest(targetDesk.Id, emp1.Id, testDate, "FullDay");
        var res1 = await _client.PostAsJsonAsync("/api/bookings", req1);
        Assert.Equal(HttpStatusCode.Created, res1.StatusCode);

        // Second booking on same desk and same date by different employee should fail with Conflict (409)
        var req2 = new CreateBookingRequest(targetDesk.Id, emp2.Id, testDate, "FullDay");
        var res2 = await _client.PostAsJsonAsync("/api/bookings", req2);
        Assert.Equal(HttpStatusCode.Conflict, res2.StatusCode);
    }
}

public record EmployeeDto(Guid Id, string Name, string Department, string Email, string AvatarUrl);
public record DeskMapItemDto(Guid Id, string Code, string Zone, string Type, int X, int Y, string Status);
public record FloorMapResponseDto(DateOnly Date, string Slot, List<DeskMapItemDto> Desks);
public record CreateBookingRequest(Guid DeskId, Guid EmployeeId, DateOnly Date, string? Slot);
