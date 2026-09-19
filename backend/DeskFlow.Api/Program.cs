using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Services Configuration
builder.Services.AddOpenApi();
builder.Services.AddSignalR();
builder.Services.AddDbContext<DeskFlowDbContext>(options =>
{
    var dbPath = Path.Combine(builder.Environment.ContentRootPath, "deskflow.db");
    options.UseSqlite($"Data Source={dbPath}");
});

// Configure CORS for Angular frontend
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// 2. Database Initialization & Seeding
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<DeskFlowDbContext>();
    db.Database.EnsureCreated();
    if (!db.Rooms.Any() || !db.Floors.Any())
    {
        DeskFlowDbContext.SeedDatabase(db);
        db.SaveChanges();
    }
}

// 3. Middleware Pipeline
app.UseCors();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Map SignalR Real-time Hub
app.MapHub<MeetingHub>("/hubs/desk");

// 4. API Endpoints

// GET /api/employees - List all employees with Roles
app.MapGet("/api/employees", async (DeskFlowDbContext db) =>
{
    var employees = await db.Employees.AsNoTracking().ToListAsync();
    return Results.Ok(employees);
})
.WithName("GetEmployees");

// GET /api/floors - List active floors
app.MapGet("/api/floors", async (DeskFlowDbContext db) =>
{
    var floors = await db.Floors
        .AsNoTracking()
        .Where(f => f.IsActive)
        .OrderBy(f => f.Level)
        .ToListAsync();
    return Results.Ok(floors);
})
.WithName("GetFloors");

// POST /api/floors - Admin: Add new floor
app.MapPost("/api/floors", async (
    [FromBody] CreateFloorRequest request,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Floor name is required." });
    }

    var floor = new Floor
    {
        Id = Guid.NewGuid(),
        Name = request.Name.Trim(),
        Level = request.Level,
        IsActive = true
    };

    db.Floors.Add(floor);
    await db.SaveChangesAsync();

    await hub.Clients.All.SendAsync("FloorCreated", floor);

    return Results.Created($"/api/floors/{floor.Id}", floor);
})
.WithName("CreateFloor");

// DELETE /api/floors/{id} - Admin: Delete floor
app.MapDelete("/api/floors/{id:guid}", async (
    Guid id,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    var floor = await db.Floors.Include(f => f.Rooms).FirstOrDefaultAsync(f => f.Id == id);
    if (floor is null)
    {
        return Results.NotFound(new { message = "Floor not found." });
    }

    var activeRoomsCount = floor.Rooms.Count(r => r.IsActive);
    if (activeRoomsCount > 0)
    {
        return Results.BadRequest(new { message = $"Cannot delete floor. It still has {activeRoomsCount} active rooms assigned. Please reassign or delete the rooms first." });
    }

    floor.IsActive = false;
    await db.SaveChangesAsync();

    await hub.Clients.All.SendAsync("FloorDeleted", id);

    return Results.Ok(new { message = $"Floor {floor.Name} deleted." });
})
.WithName("DeleteFloor");

// GET /api/rooms - List all active meeting rooms
app.MapGet("/api/rooms", async (DeskFlowDbContext db) =>
{
    var rooms = await db.Rooms
        .AsNoTracking()
        .Include(r => r.Floor)
        .Where(r => r.IsActive)
        .OrderBy(r => r.Code)
        .ToListAsync();
    return Results.Ok(rooms);
})
.WithName("GetRooms");

// GET /api/rooms/schedule - Rooms schedule with bookings, attendees, and RSVP statuses
app.MapGet("/api/rooms/schedule", async (
    [FromQuery] Guid? floorId,
    [FromQuery] DateOnly? date,
    [FromQuery] string? slot,
    DeskFlowDbContext db) =>
{
    var queryDate = date ?? DateOnly.FromDateTime(DateTime.Today);
    var querySlot = string.IsNullOrWhiteSpace(slot) ? "FullDay" : slot;

    var query = db.Rooms
        .AsNoTracking()
        .Include(r => r.Floor)
        .Where(r => r.IsActive);

    if (floorId.HasValue && floorId.Value != Guid.Empty)
    {
        query = query.Where(r => r.FloorId == floorId.Value);
    }

    var rooms = await query.OrderBy(r => r.Code).ToListAsync();

    var roomIds = rooms.Select(r => r.Id).ToList();
    var bookings = await db.Bookings
        .AsNoTracking()
        .Include(b => b.Host)
        .Include(b => b.Attendees)
            .ThenInclude(a => a.Employee)
        .Where(b => roomIds.Contains(b.RoomId) &&
                    b.Date == queryDate &&
                    (b.Slot == querySlot || b.Slot == "FullDay" || querySlot == "FullDay") &&
                    b.Status == "Scheduled")
        .ToListAsync();

    var result = rooms.Select(r =>
    {
        var booking = bookings.FirstOrDefault(b => b.RoomId == r.Id);
        return new RoomScheduleItemDto(
            r.Id,
            r.Name,
            r.Code,
            r.FloorId,
            r.Floor?.Name ?? "Main Floor",
            r.Floor?.Level ?? 1,
            r.Zone,
            r.Capacity,
            r.Amenities,
            booking is null ? "Available" : "Booked",
            booking?.Id,
            booking?.Title,
            booking?.HostEmployeeId,
            booking?.Host?.Name,
            booking?.Host?.Department,
            booking?.Host?.AvatarUrl,
            booking?.Attendees?.Select(a => new AttendeeDto(
                a.EmployeeId,
                a.Employee.Name,
                a.Employee.Department,
                a.Employee.AvatarUrl,
                a.Status,
                a.RespondedAt
            )).ToList() ?? new List<AttendeeDto>(),
            booking?.CreatedAt
        );
    }).ToList();

    return Results.Ok(new RoomScheduleResponseDto(queryDate, querySlot, result));
})
.WithName("GetRoomSchedule");

// POST /api/rooms - Admin: Create new meeting room with floor assignment
app.MapPost("/api/rooms", async (
    [FromBody] CreateRoomRequest request,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Code))
    {
        return Results.BadRequest(new { message = "Room Name and Code are required." });
    }

    var floor = await db.Floors.FindAsync(request.FloorId);
    if (floor is null || !floor.IsActive)
    {
        return Results.BadRequest(new { message = "Invalid Floor selected." });
    }

    var codeExists = await db.Rooms.AnyAsync(r => r.Code == request.Code && r.IsActive);
    if (codeExists)
    {
        return Results.Conflict(new { message = $"Room with code {request.Code} already exists." });
    }

    var room = new MeetingRoom
    {
        Id = Guid.NewGuid(),
        Name = request.Name.Trim(),
        Code = request.Code.Trim().ToUpperInvariant(),
        FloorId = request.FloorId,
        Zone = string.IsNullOrWhiteSpace(request.Zone) ? "Main Bay" : request.Zone.Trim(),
        Capacity = Math.Max(1, request.Capacity),
        Amenities = request.Amenities?.Trim() ?? "Teams 4K Video, Dual Displays",
        IsActive = true
    };

    db.Rooms.Add(room);
    await db.SaveChangesAsync();

    await hub.Clients.All.SendAsync("RoomCreated", room);

    return Results.Created($"/api/rooms/{room.Id}", room);
})
.WithName("CreateRoom");

// PUT /api/rooms/{id} - Admin: Update meeting room details, floor & capacity
app.MapPut("/api/rooms/{id:guid}", async (
    Guid id,
    [FromBody] UpdateRoomRequest request,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    var room = await db.Rooms.FindAsync(id);
    if (room is null || !room.IsActive)
    {
        return Results.NotFound(new { message = "Meeting room not found." });
    }

    var floor = await db.Floors.FindAsync(request.FloorId);
    if (floor is null || !floor.IsActive)
    {
        return Results.BadRequest(new { message = "Invalid Floor selected." });
    }

    room.Name = request.Name.Trim();
    room.FloorId = request.FloorId;
    room.Zone = request.Zone.Trim();
    room.Capacity = Math.Max(1, request.Capacity);
    room.Amenities = request.Amenities.Trim();

    await db.SaveChangesAsync();

    await hub.Clients.All.SendAsync("RoomUpdated", room);

    return Results.Ok(room);
})
.WithName("UpdateRoom");

// DELETE /api/rooms/{id} - Admin: Delete meeting room
app.MapDelete("/api/rooms/{id:guid}", async (
    Guid id,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    var room = await db.Rooms.FindAsync(id);
    if (room is null)
    {
        return Results.NotFound(new { message = "Room not found." });
    }

    room.IsActive = false;
    await db.SaveChangesAsync();

    await hub.Clients.All.SendAsync("RoomDeleted", id);

    return Results.Ok(new { message = $"Room {room.Code} deleted successfully." });
})
.WithName("DeleteRoom");

// POST /api/bookings - Schedule meeting with invited attendees
app.MapPost("/api/bookings", async (
    [FromBody] CreateMeetingBookingRequest request,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    if (request.RoomId == Guid.Empty || request.HostEmployeeId == Guid.Empty)
    {
        return Results.BadRequest(new { message = "RoomId and HostEmployeeId are required." });
    }

    var room = await db.Rooms.FindAsync(request.RoomId);
    if (room is null || !room.IsActive)
    {
        return Results.NotFound(new { message = "Meeting room not found or inactive." });
    }

    var host = await db.Employees.FindAsync(request.HostEmployeeId);
    if (host is null)
    {
        return Results.NotFound(new { message = "Host employee not found." });
    }

    var targetDate = request.Date == default ? DateOnly.FromDateTime(DateTime.Today) : request.Date;
    var targetSlot = string.IsNullOrWhiteSpace(request.Slot) ? "FullDay" : request.Slot;

    var isRoomBooked = await db.Bookings
        .AnyAsync(b => b.RoomId == request.RoomId &&
                       b.Date == targetDate &&
                       (b.Slot == targetSlot || b.Slot == "FullDay" || targetSlot == "FullDay") &&
                       b.Status == "Scheduled");
    if (isRoomBooked)
    {
        return Results.Conflict(new { message = $"Room {room.Name} is already booked for {targetDate} ({targetSlot})." });
    }

    var attendeeIds = request.InvitedEmployeeIds?.Distinct().Where(id => id != request.HostEmployeeId).ToList() ?? new List<Guid>();
    var totalParticipants = attendeeIds.Count + 1;
    if (totalParticipants > room.Capacity)
    {
        return Results.BadRequest(new { message = $"Total participants ({totalParticipants}) exceed room capacity ({room.Capacity} seats)." });
    }

    var booking = new MeetingBooking
    {
        Id = Guid.NewGuid(),
        RoomId = request.RoomId,
        HostEmployeeId = request.HostEmployeeId,
        Title = string.IsNullOrWhiteSpace(request.Title) ? "Team Sync" : request.Title.Trim(),
        Date = targetDate,
        Slot = targetSlot,
        Status = "Scheduled",
        CreatedAt = DateTimeOffset.UtcNow
    };

    foreach (var attId in attendeeIds)
    {
        booking.Attendees.Add(new MeetingAttendee
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            EmployeeId = attId,
            Status = "Pending" // Initial state: Pending invite
        });
    }

    db.Bookings.Add(booking);
    await db.SaveChangesAsync();

    var savedBooking = await db.Bookings
        .Include(b => b.Room)
        .Include(b => b.Host)
        .Include(b => b.Attendees)
            .ThenInclude(a => a.Employee)
        .FirstAsync(b => b.Id == booking.Id);

    var broadcastPayload = new MeetingScheduleUpdateDto(
        savedBooking.RoomId,
        savedBooking.Room.Name,
        savedBooking.Room.Code,
        savedBooking.Id,
        savedBooking.Title,
        savedBooking.Date,
        savedBooking.Slot,
        savedBooking.HostEmployeeId,
        savedBooking.Host.Name,
        savedBooking.Host.Department,
        savedBooking.Host.AvatarUrl,
        savedBooking.Attendees.Select(a => new AttendeeDto(
            a.EmployeeId,
            a.Employee.Name,
            a.Employee.Department,
            a.Employee.AvatarUrl,
            a.Status,
            a.RespondedAt
        )).ToList()
    );

    await hub.Clients.All.SendAsync("MeetingBooked", broadcastPayload);

    return Results.Created($"/api/bookings/{booking.Id}", broadcastPayload);
})
.WithName("CreateMeetingBooking");

// POST /api/bookings/{id}/rsvp - Attendee accepts or declines invitation
app.MapPost("/api/bookings/{id:guid}/rsvp", async (
    Guid id,
    [FromBody] RsvpRequest request,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    var attendee = await db.Attendees
        .Include(a => a.Employee)
        .Include(a => a.Booking)
            .ThenInclude(b => b.Room)
        .FirstOrDefaultAsync(a => a.BookingId == id && a.EmployeeId == request.EmployeeId);

    if (attendee is null)
    {
        return Results.NotFound(new { message = "You are not an invited attendee for this meeting." });
    }

    var validStatuses = new[] { "Accepted", "Declined" };
    if (!validStatuses.Contains(request.Status))
    {
        return Results.BadRequest(new { message = "Status must be 'Accepted' or 'Declined'." });
    }

    attendee.Status = request.Status;
    attendee.RespondedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();

    var rsvpDto = new AttendeeRsvpDto(
        id,
        attendee.Booking.RoomId,
        request.EmployeeId,
        attendee.Employee.Name,
        request.Status,
        attendee.RespondedAt.Value
    );

    await hub.Clients.All.SendAsync("AttendeeRsvpUpdated", rsvpDto);

    return Results.Ok(new { message = $"Invitation {request.Status.ToLower()}." });
})
.WithName("SubmitRsvp");

// DELETE /api/bookings/{id} - Cancel scheduled meeting
app.MapDelete("/api/bookings/{id:guid}", async (
    Guid id,
    DeskFlowDbContext db,
    IHubContext<MeetingHub> hub) =>
{
    var booking = await db.Bookings.Include(b => b.Room).FirstOrDefaultAsync(b => b.Id == id);
    if (booking is null)
    {
        return Results.NotFound(new { message = "Meeting booking not found." });
    }

    booking.Status = "Cancelled";
    await db.SaveChangesAsync();

    await hub.Clients.All.SendAsync("MeetingCancelled", new { bookingId = id, roomId = booking.RoomId, roomCode = booking.Room.Code });

    return Results.Ok(new { message = $"Meeting in {booking.Room.Code} cancelled." });
})
.WithName("CancelMeetingBooking");

// POST /api/demo/reset - Reset demo floors, rooms, and meetings
app.MapPost("/api/demo/reset", async (DeskFlowDbContext db, IHubContext<MeetingHub> hub) =>
{
    db.Attendees.RemoveRange(db.Attendees);
    db.Bookings.RemoveRange(db.Bookings);
    db.Rooms.RemoveRange(db.Rooms);
    db.Floors.RemoveRange(db.Floors);
    db.Employees.RemoveRange(db.Employees);
    await db.SaveChangesAsync();

    DeskFlowDbContext.SeedDatabase(db);
    await db.SaveChangesAsync();

    await hub.Clients.All.SendAsync("FloorReset");
    return Results.Ok(new { message = "Meeting system and floors reset successfully." });
})
.WithName("ResetDemoSystem");

var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";
app.Run($"http://0.0.0.0:{port}");

// -------------------------------------------------------------
// SignalR Hub
// -------------------------------------------------------------
public class MeetingHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("Connected", Context.ConnectionId);
        await base.OnConnectedAsync();
    }
}

// -------------------------------------------------------------
// Database Context & Domain Model
// -------------------------------------------------------------
public class DeskFlowDbContext : DbContext
{
    public DeskFlowDbContext(DbContextOptions<DeskFlowDbContext> options) : base(options) { }

    public DbSet<Floor> Floors => Set<Floor>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<MeetingRoom> Rooms => Set<MeetingRoom>();
    public DbSet<MeetingBooking> Bookings => Set<MeetingBooking>();
    public DbSet<MeetingAttendee> Attendees => Set<MeetingAttendee>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MeetingBooking>()
            .HasIndex(b => new { b.RoomId, b.Date, b.Slot, b.Status })
            .HasDatabaseName("IX_Booking_Room_Date_Slot_Status");

        modelBuilder.Entity<MeetingBooking>()
            .HasOne(b => b.Host)
            .WithMany()
            .HasForeignKey(b => b.HostEmployeeId);

        modelBuilder.Entity<MeetingRoom>()
            .HasOne(r => r.Floor)
            .WithMany(f => f.Rooms)
            .HasForeignKey(r => r.FloorId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<MeetingAttendee>()
            .HasOne(a => a.Booking)
            .WithMany(b => b.Attendees)
            .HasForeignKey(a => a.BookingId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<MeetingAttendee>()
            .HasOne(a => a.Employee)
            .WithMany()
            .HasForeignKey(a => a.EmployeeId);
    }

    public static void SeedDatabase(DeskFlowDbContext db)
    {
        // 1. Seed Floors
        var floor12 = new Floor { Id = Guid.Parse("f0000000-0000-0000-0000-000000000012"), Name = "Floor 12 · Design & Creative Studio", Level = 12, IsActive = true };
        var floor14 = new Floor { Id = Guid.Parse("f0000000-0000-0000-0000-000000000014"), Name = "Floor 14 · Main Tech & Innovation HQ", Level = 14, IsActive = true };
        var floor15 = new Floor { Id = Guid.Parse("f0000000-0000-0000-0000-000000000015"), Name = "Floor 15 · Executive Boardrooms", Level = 15, IsActive = true };

        db.Floors.AddRange(floor12, floor14, floor15);

        // 2. Seed Employees
        var empAlex = new Employee { Id = Guid.Parse("11111111-1111-1111-1111-111111111111"), Name = "Alex Tan", Department = "Engineering", Role = "Admin", Email = "alex@deskflow.co", AvatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80" };
        var empSarah = new Employee { Id = Guid.Parse("22222222-2222-2222-2222-222222222222"), Name = "Sarah Connor", Department = "Product", Role = "Employee", Email = "sarah@deskflow.co", AvatarUrl = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80" };
        var empDavid = new Employee { Id = Guid.Parse("33333333-3333-3333-3333-333333333333"), Name = "David Miller", Department = "Design", Role = "Employee", Email = "david@deskflow.co", AvatarUrl = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80" };
        var empPriya = new Employee { Id = Guid.Parse("44444444-4444-4444-4444-444444444444"), Name = "Priya Sharma", Department = "Engineering", Role = "Employee", Email = "priya@deskflow.co", AvatarUrl = "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80" };
        var empLiam = new Employee { Id = Guid.Parse("55555555-5555-5555-5555-555555555555"), Name = "Liam Wilson", Department = "Marketing", Role = "Employee", Email = "liam@deskflow.co", AvatarUrl = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80" };
        var empEmily = new Employee { Id = Guid.Parse("66666666-6666-6666-6666-666666666666"), Name = "Emily Zhang", Department = "HR", Role = "Admin", Email = "emily@deskflow.co", AvatarUrl = "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80" };

        db.Employees.AddRange(empAlex, empSarah, empDavid, empPriya, empLiam, empEmily);

        // 3. Seed Rooms on respective Floors
        var room1 = new MeetingRoom { Id = Guid.Parse("a0000000-0000-0000-0000-000000000001"), FloorId = floor15.Id, Name = "Starlight Boardroom", Code = "ROOM-1501", Zone = "Executive Wing", Capacity = 14, Amenities = "Teams 4K Video, Dual Displays, Conference Audio", IsActive = true };
        var room2 = new MeetingRoom { Id = Guid.Parse("a0000000-0000-0000-0000-000000000002"), FloorId = floor14.Id, Name = "Quantum Collaboration Lab", Code = "ROOM-1401", Zone = "Innovation Bay", Capacity = 8, Amenities = "Digital Whiteboard, Video Conf, Presentation Dock", IsActive = true };
        var room3 = new MeetingRoom { Id = Guid.Parse("b0000000-0000-0000-0000-000000000001"), FloorId = floor14.Id, Name = "Nexus Strategy Room", Code = "ROOM-1402", Zone = "Strategy Hub", Capacity = 10, Amenities = "Teams Hub, 75in Display, Conference Mic", IsActive = true };
        var room4 = new MeetingRoom { Id = Guid.Parse("b0000000-0000-0000-0000-000000000002"), FloorId = floor12.Id, Name = "Apollo Design Workshop", Code = "ROOM-1201", Zone = "Creative Bay", Capacity = 6, Amenities = "Movable Whiteboards, Smart Display", IsActive = true };
        var room5 = new MeetingRoom { Id = Guid.Parse("c0000000-0000-0000-0000-000000000001"), FloorId = floor14.Id, Name = "Zenith 1-on-1 Pod", Code = "POD-14A", Zone = "Quiet Pods", Capacity = 3, Amenities = "Acoustic Insulation, HD Cam, Ring Light", IsActive = true };
        var room6 = new MeetingRoom { Id = Guid.Parse("c0000000-0000-0000-0000-000000000002"), FloorId = floor12.Id, Name = "Horizon Focus Pod", Code = "POD-12A", Zone = "Quiet Pods", Capacity = 3, Amenities = "Acoustic Insulation, UltraWide Display", IsActive = true };

        db.Rooms.AddRange(room1, room2, room3, room4, room5, room6);
        db.SaveChanges();

        // 4. Seed Meetings with RSVP statuses
        var today = DateOnly.FromDateTime(DateTime.Today);
        var booking1 = new MeetingBooking
        {
            Id = Guid.NewGuid(),
            RoomId = room1.Id,
            HostEmployeeId = empSarah.Id,
            Title = "Q4 Product Strategy & Architecture",
            Date = today,
            Slot = "FullDay",
            Status = "Scheduled",
            CreatedAt = DateTimeOffset.UtcNow.AddHours(-2)
        };
        // Alex has Pending status (can demonstrate Accept/Decline!), David Accepted, Priya Accepted
        booking1.Attendees.Add(new MeetingAttendee { Id = Guid.NewGuid(), BookingId = booking1.Id, EmployeeId = empAlex.Id, Status = "Pending" });
        booking1.Attendees.Add(new MeetingAttendee { Id = Guid.NewGuid(), BookingId = booking1.Id, EmployeeId = empDavid.Id, Status = "Accepted", RespondedAt = DateTimeOffset.UtcNow.AddHours(-1) });
        booking1.Attendees.Add(new MeetingAttendee { Id = Guid.NewGuid(), BookingId = booking1.Id, EmployeeId = empPriya.Id, Status = "Accepted", RespondedAt = DateTimeOffset.UtcNow.AddMinutes(-45) });

        var booking2 = new MeetingBooking
        {
            Id = Guid.NewGuid(),
            RoomId = room4.Id,
            HostEmployeeId = empDavid.Id,
            Title = "Design System & Figma Token Audit",
            Date = today,
            Slot = "FullDay",
            Status = "Scheduled",
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-30)
        };
        booking2.Attendees.Add(new MeetingAttendee { Id = Guid.NewGuid(), BookingId = booking2.Id, EmployeeId = empAlex.Id, Status = "Pending" });
        booking2.Attendees.Add(new MeetingAttendee { Id = Guid.NewGuid(), BookingId = booking2.Id, EmployeeId = empLiam.Id, Status = "Accepted" });

        db.Bookings.AddRange(booking1, booking2);
    }
}

// -------------------------------------------------------------
// Domain Entities
// -------------------------------------------------------------
public class Floor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(100)] public string Name { get; set; } = string.Empty;
    public int Level { get; set; } = 1;
    public bool IsActive { get; set; } = true;
    public List<MeetingRoom> Rooms { get; set; } = new();
}

public class Employee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(100)] public string Name { get; set; } = string.Empty;
    [MaxLength(50)] public string Department { get; set; } = string.Empty;
    [MaxLength(20)] public string Role { get; set; } = "Employee"; // "Admin" or "Employee"
    [MaxLength(150)] public string Email { get; set; } = string.Empty;
    [MaxLength(300)] public string AvatarUrl { get; set; } = string.Empty;
}

public class MeetingRoom
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FloorId { get; set; }
    public Floor Floor { get; set; } = null!;
    [MaxLength(100)] public string Name { get; set; } = string.Empty;
    [MaxLength(20)] public string Code { get; set; } = string.Empty;
    [MaxLength(50)] public string Zone { get; set; } = string.Empty;
    public int Capacity { get; set; } = 6;
    [MaxLength(200)] public string Amenities { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class MeetingBooking
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RoomId { get; set; }
    public MeetingRoom Room { get; set; } = null!;
    public Guid HostEmployeeId { get; set; }
    public Employee Host { get; set; } = null!;
    [MaxLength(150)] public string Title { get; set; } = string.Empty;
    public DateOnly Date { get; set; }
    [MaxLength(20)] public string Slot { get; set; } = "FullDay";
    [MaxLength(20)] public string Status { get; set; } = "Scheduled";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<MeetingAttendee> Attendees { get; set; } = new();
}

public class MeetingAttendee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BookingId { get; set; }
    public MeetingBooking Booking { get; set; } = null!;
    public Guid EmployeeId { get; set; }
    public Employee Employee { get; set; } = null!;
    [MaxLength(20)] public string Status { get; set; } = "Pending"; // "Pending", "Accepted", "Declined"
    public DateTimeOffset? RespondedAt { get; set; }
}

// -------------------------------------------------------------
// DTOs & Contracts
// -------------------------------------------------------------
public record CreateFloorRequest(string Name, int Level);
public record CreateRoomRequest(string Name, string Code, Guid FloorId, string Zone, int Capacity, string? Amenities);
public record UpdateRoomRequest(string Name, Guid FloorId, string Zone, int Capacity, string Amenities);
public record CreateMeetingBookingRequest(Guid RoomId, Guid HostEmployeeId, string Title, DateOnly Date, string? Slot, List<Guid>? InvitedEmployeeIds);
public record RsvpRequest(Guid EmployeeId, string Status);

public record AttendeeDto(Guid EmployeeId, string Name, string Department, string AvatarUrl, string Status, DateTimeOffset? RespondedAt);

public record RoomScheduleItemDto(
    Guid Id,
    string Name,
    string Code,
    Guid FloorId,
    string FloorName,
    int FloorLevel,
    string Zone,
    int Capacity,
    string Amenities,
    string Status,
    Guid? BookingId,
    string? Title,
    Guid? HostId,
    string? HostName,
    string? HostDepartment,
    string? HostAvatar,
    List<AttendeeDto> Attendees,
    DateTimeOffset? CreatedAt
);

public record RoomScheduleResponseDto(DateOnly Date, string Slot, List<RoomScheduleItemDto> Rooms);

public record MeetingScheduleUpdateDto(
    Guid RoomId,
    string RoomName,
    string RoomCode,
    Guid BookingId,
    string Title,
    DateOnly Date,
    string Slot,
    Guid HostId,
    string HostName,
    string HostDepartment,
    string HostAvatar,
    List<AttendeeDto> Attendees
);

public record AttendeeRsvpDto(
    Guid BookingId,
    Guid RoomId,
    Guid EmployeeId,
    string EmployeeName,
    string Status,
    DateTimeOffset RespondedAt
);

public partial class Program { }
