import { Component, OnInit, OnDestroy, HostListener, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';

export interface Employee {
  id: string;
  name: string;
  department: string;
  role: 'Admin' | 'Employee';
  email: string;
  avatarUrl: string;
}

export interface Attendee {
  employeeId: string;
  name: string;
  department: string;
  avatarUrl: string;
  status: 'Pending' | 'Accepted' | 'Declined';
  respondedAt?: string;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  isActive: boolean;
  rooms?: any[];
}

export interface RoomScheduleItem {
  id: string;
  name: string;
  code: string;
  floorId: string;
  floorName: string;
  floorLevel: number;
  zone: string;
  capacity: number;
  amenities: string;
  status: 'Available' | 'Booked';
  bookingId?: string;
  title?: string;
  hostId?: string;
  hostName?: string;
  hostDepartment?: string;
  hostAvatar?: string;
  attendees: Attendee[];
  createdAt?: string;
}

export interface RoomScheduleResponse {
  date: string;
  slot: string;
  rooms: RoomScheduleItem[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen office-grid-bg text-slate-800 flex flex-col selection:bg-indigo-500 selection:text-white pb-16">
      
      <!-- Top Navigation Bar -->
      <header class="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          <!-- Logo & Workspace Identity (Matching Brand Guidelines) -->
          <div class="flex items-center space-x-2.5 sm:space-x-3">
            <img 
              src="deskflow-logo-icon.png" 
              alt="DeskFlow Logo" 
              class="h-10 sm:h-11 w-auto object-contain shrink-0 transition-transform duration-200 hover:scale-105" />
            <div class="flex flex-col justify-center">
              <div class="text-xl sm:text-2xl font-black tracking-tight leading-none select-none">
                <span class="text-slate-900">Desk</span><span class="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Flow</span>
              </div>
              <p class="text-[11px] sm:text-xs text-slate-500 font-semibold tracking-normal mt-1 truncate">Meeting Rooms, Pods & Team Invitations</p>
            </div>
          </div>

          <!-- Controls, Role Badge & User Profile Popover -->
          <div class="flex items-center space-x-2.5 sm:space-x-3">
            
            <!-- Admin Actions (Manage Floors & Add Room) -->
            <ng-container *ngIf="isAdmin()">
              <button 
                (click)="openManageFloorsModal()"
                class="h-10 px-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] whitespace-nowrap">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span>Manage Floors</span>
              </button>

              <button 
                (click)="openAddRoomModal()"
                class="h-10 px-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-500/20 inline-flex items-center gap-1.5 transition-all active:scale-[0.98] whitespace-nowrap">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Room</span>
              </button>
            </ng-container>

            <!-- Custom Popover: User Persona Switcher with Role Display -->
            <div class="relative">
              <button 
                type="button"
                (click)="toggleUserDropdown()"
                class="flex items-center space-x-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-2xl px-3 py-1.5 transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] h-10">
                <img [src]="currentUser()?.avatarUrl" class="w-7 h-7 rounded-full object-cover ring-2 ring-indigo-500/30 shrink-0" [alt]="currentUser()?.name || ''" />
                <div class="text-left hidden sm:block">
                  <div class="flex items-center space-x-1.5">
                    <span class="text-xs font-bold text-slate-800 leading-tight truncate max-w-[100px]">{{ currentUser()?.name }}</span>
                    <!-- Role Pill -->
                    <span class="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase"
                          [ngClass]="isAdmin() ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-slate-200 text-slate-700'">
                      {{ currentUser()?.role }}
                    </span>
                  </div>
                  <div class="text-[10px] font-semibold text-indigo-600 truncate">{{ currentUser()?.department }}</div>
                </div>
                <svg class="w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0" 
                     [ngClass]="isUserDropdownOpen() ? 'rotate-180 text-indigo-600' : ''" 
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <!-- Popover Card -->
              <div *ngIf="isUserDropdownOpen()" 
                   class="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-dropdownFade">
                <div class="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
                  <span>Switch Employee Profile</span>
                  <span class="text-[10px] text-slate-500 lowercase">Admin vs Staff</span>
                </div>
                <div class="py-1 max-h-72 overflow-y-auto space-y-0.5">
                  <button 
                    *ngFor="let emp of employees()" 
                    (click)="selectUser(emp.id)"
                    class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors text-xs"
                    [ngClass]="emp.id === currentUserId() ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'">
                    <div class="flex items-center space-x-2.5 truncate">
                      <img [src]="emp.avatarUrl" class="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-slate-200" [alt]="emp.name" />
                      <div class="truncate">
                        <div class="flex items-center space-x-1.5">
                          <span class="truncate font-semibold">{{ emp.name }}</span>
                          <span class="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase"
                                [ngClass]="emp.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'">
                            {{ emp.role }}
                          </span>
                        </div>
                        <div class="text-[10px] text-slate-400 truncate">{{ emp.department }}</div>
                      </div>
                    </div>
                    <svg *ngIf="emp.id === currentUserId()" class="w-4 h-4 text-indigo-600 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Reset Demo State Button -->
            <button 
              (click)="resetDemoFloor()" 
              title="Reset rooms & sample bookings"
              class="h-10 w-10 flex items-center justify-center rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 transition-all shadow-2xs hover:shadow-xs active:scale-95 shrink-0">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <!-- Main Container -->
      <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        <!-- Notification Toast -->
        <div *ngIf="toastMessage()" 
             class="rounded-2xl px-4 py-3.5 flex items-center justify-between transition-all duration-300 shadow-sm border animate-slideDown"
             [ngClass]="toastType() === 'success' ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900' : 'bg-rose-50/95 border-rose-200 text-rose-900'">
          <div class="flex items-center space-x-3 text-sm">
            <div class="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" 
                 [ngClass]="toastType() === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'">
              <svg *ngIf="toastType() === 'success'" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <svg *ngIf="toastType() === 'error'" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <span class="font-semibold">{{ toastMessage() }}</span>
          </div>
          <button (click)="toastMessage.set(null)" class="text-slate-400 hover:text-slate-600 p-1 shrink-0">
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Metric Stat Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          
          <div class="card-surface rounded-3xl p-5 relative overflow-hidden transition-all duration-200 hover:-translate-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Rooms</span>
              <div class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
            <div class="text-3xl font-extrabold text-slate-900 mt-2 tracking-tight">{{ totalRooms() }}</div>
            <div class="text-xs font-medium text-slate-500 mt-1">
              <span>{{ totalSeats() }} Total Meeting Seats · {{ floors().length }} Floors</span>
            </div>
          </div>

          <div class="card-surface rounded-3xl p-5 relative overflow-hidden transition-all duration-200 hover:-translate-y-1 border-l-4 border-l-emerald-500">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-700 uppercase tracking-wider">Available Rooms</span>
              <div class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div class="text-3xl font-extrabold text-emerald-600 mt-2 tracking-tight">{{ availableRooms() }}</div>
            <div class="text-xs font-medium text-slate-500 mt-1">
              <span class="font-bold text-emerald-700">{{ availablePercentage() }}%</span> ready for booking
            </div>
          </div>

          <div class="card-surface rounded-3xl p-5 relative overflow-hidden transition-all duration-200 hover:-translate-y-1 border-l-4 border-l-amber-500">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-amber-800 uppercase tracking-wider">In Session / Booked</span>
              <div class="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div class="text-3xl font-extrabold text-amber-600 mt-2 tracking-tight">{{ bookedRooms() }}</div>
            <div class="text-xs font-medium text-slate-500 mt-1">
              Active sessions scheduled
            </div>
          </div>

          <!-- Active Invites Notification Metric -->
          <div class="card-surface rounded-3xl p-5 relative overflow-hidden transition-all duration-200 hover:-translate-y-1 border-l-4 border-l-indigo-500 bg-indigo-50/20">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-indigo-800 uppercase tracking-wider">My Pending Invites</span>
              <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div class="text-3xl font-extrabold text-indigo-700 mt-2 tracking-tight">{{ pendingInvitesCount() }}</div>
            <div class="text-xs font-medium text-slate-500 mt-1">
              {{ myMeetings().length }} total sessions involving you
            </div>
          </div>

        </div>

        <!-- My Meetings & RSVP Action Center (Microsoft Teams Style) -->
        <div *ngIf="myMeetings().length > 0" class="card-surface rounded-3xl p-6 border-indigo-200/80 bg-gradient-to-r from-indigo-50/30 via-white to-white space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2.5">
              <div class="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 class="font-extrabold text-base text-slate-900 tracking-tight">My Meeting Schedule & RSVP Invites</h3>
                <p class="text-xs text-slate-500">Review invitations, accept or decline attendance, and manage your meetings</p>
              </div>
            </div>
            <span class="text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
              {{ myMeetings().length }} Meetings
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div *ngFor="let m of myMeetings()" 
                 class="bg-white border rounded-2xl p-4 shadow-2xs space-y-3 flex flex-col justify-between"
                 [ngClass]="getUserAttendeeStatus(m) === 'Pending' ? 'border-amber-300 ring-2 ring-amber-400/20' : 'border-slate-200'">
              
              <div>
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center space-x-2">
                    <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                      {{ m.code }}
                    </span>
                    <span class="text-xs font-semibold text-slate-500 truncate">Floor {{ m.floorLevel }}</span>
                  </div>
                  <!-- Host or Role Pill -->
                  <span *ngIf="m.hostId === currentUserId()" class="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    Host
                  </span>
                  <span *ngIf="m.hostId !== currentUserId()" 
                        class="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full"
                        [ngClass]="{
                          'bg-emerald-100 text-emerald-800': getUserAttendeeStatus(m) === 'Accepted',
                          'bg-amber-100 text-amber-800': getUserAttendeeStatus(m) === 'Pending',
                          'bg-rose-100 text-rose-800': getUserAttendeeStatus(m) === 'Declined'
                        }">
                    {{ getUserAttendeeStatus(m) }}
                  </span>
                </div>

                <h4 class="font-bold text-sm text-slate-900 mt-2 truncate">{{ m.title }}</h4>
                <div class="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <span>Host: {{ m.hostName }} ({{ m.hostDepartment }})</span>
                </div>
              </div>

              <!-- RSVP Response Controls (For Invited Employee) -->
              <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                
                <!-- If current user is host or admin: option to cancel -->
                <div *ngIf="m.hostId === currentUserId() || isAdmin()" class="w-full">
                  <button (click)="cancelBooking(m.bookingId!)"
                          class="w-full h-8 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-bold transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cancel Meeting</span>
                  </button>
                </div>

                <!-- If current user is an invitee: Accept / Decline buttons -->
                <div *ngIf="m.hostId !== currentUserId()" class="w-full flex items-center gap-2">
                  <button 
                    (click)="respondToInvite(m.bookingId!, 'Accepted')"
                    [disabled]="getUserAttendeeStatus(m) === 'Accepted'"
                    class="flex-1 h-8 px-3 rounded-xl text-xs font-bold transition inline-flex items-center justify-center gap-1 whitespace-nowrap"
                    [ngClass]="getUserAttendeeStatus(m) === 'Accepted' ? 'bg-emerald-100 text-emerald-800 opacity-60 cursor-default' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Accept</span>
                  </button>

                  <button 
                    (click)="respondToInvite(m.bookingId!, 'Declined')"
                    [disabled]="getUserAttendeeStatus(m) === 'Declined'"
                    class="flex-1 h-8 px-3 rounded-xl text-xs font-bold transition inline-flex items-center justify-center gap-1 whitespace-nowrap"
                    [ngClass]="getUserAttendeeStatus(m) === 'Declined' ? 'bg-rose-100 text-rose-800 opacity-60 cursor-default' : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200'">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Decline</span>
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>

        <!-- Controls Toolbar (Date, Slot, Floor Popover, Zone Popover) -->
        <div class="card-surface rounded-3xl p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            
            <!-- Date & Time Slot Segmented Buttons -->
            <div class="flex flex-wrap items-center gap-3">
              <div class="inline-flex rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-2xs h-10 items-center">
                <button 
                  (click)="setDateOffset(0)" 
                  [ngClass]="dateOffset() === 0 ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 font-medium hover:text-slate-900'"
                  class="h-8 px-4 text-xs rounded-xl transition-all whitespace-nowrap inline-flex items-center justify-center">
                  Today
                </button>
                <button 
                  (click)="setDateOffset(1)" 
                  [ngClass]="dateOffset() === 1 ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 font-medium hover:text-slate-900'"
                  class="h-8 px-4 text-xs rounded-xl transition-all whitespace-nowrap inline-flex items-center justify-center">
                  Tomorrow
                </button>
              </div>

              <div class="inline-flex rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-2xs h-10 items-center">
                <button *ngFor="let s of ['FullDay', 'Morning', 'Afternoon']"
                  (click)="selectedSlot.set(s); loadRoomsSchedule()"
                  [ngClass]="selectedSlot() === s ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-600 font-medium hover:text-slate-900'"
                  class="h-8 px-3.5 text-xs rounded-xl transition-all whitespace-nowrap inline-flex items-center justify-center">
                  {{ s }}
                </button>
              </div>
            </div>

            <!-- Custom Popover Filters (Floor & Zone) -->
            <div class="flex flex-wrap items-center gap-2.5">
              
              <!-- 1. Custom Floor Selector Popover -->
              <div class="relative">
                <button 
                  type="button"
                  (click)="toggleFloorDropdown()"
                  class="flex items-center space-x-2 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] h-10">
                  <svg class="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span class="whitespace-nowrap">{{ selectedFloorDisplay() }}</span>
                  <svg class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0" 
                       [ngClass]="isFloorDropdownOpen() ? 'rotate-180 text-indigo-600' : ''" 
                       fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div *ngIf="isFloorDropdownOpen()" 
                     class="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-dropdownFade">
                  <div class="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
                    <span>Select Building Floor</span>
                    <span class="text-[10px] text-indigo-600 lowercase font-medium">{{ floors().length }} active</span>
                  </div>
                  <div class="py-1 space-y-0.5 max-h-60 overflow-y-auto">
                    <!-- All Floors Option -->
                    <button 
                      (click)="selectedFloorId.set('All'); isFloorDropdownOpen.set(false)"
                      class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors text-xs"
                      [ngClass]="selectedFloorId() === 'All' ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'">
                      <span class="truncate">All Office Floors</span>
                      <svg *ngIf="selectedFloorId() === 'All'" class="w-4 h-4 text-indigo-600 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>

                    <!-- Individual Floors -->
                    <button 
                      *ngFor="let floor of floors()" 
                      (click)="selectedFloorId.set(floor.id); isFloorDropdownOpen.set(false)"
                      class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors text-xs"
                      [ngClass]="floor.id === selectedFloorId() ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'">
                      <div class="truncate">
                        <div class="font-bold truncate">Level {{ floor.level }}</div>
                        <div class="text-[10px] text-slate-400 truncate">{{ floor.name }}</div>
                      </div>
                      <svg *ngIf="floor.id === selectedFloorId()" class="w-4 h-4 text-indigo-600 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 2. Custom Accessible Zone Selector Popover -->
              <div class="relative">
                <button 
                  type="button"
                  (click)="toggleZoneDropdown()"
                  class="flex items-center space-x-2 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] h-10">
                  <svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span class="whitespace-nowrap">{{ selectedZone() === 'All' ? 'All Office Zones' : selectedZone() }}</span>
                  <svg class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0" 
                       [ngClass]="isZoneDropdownOpen() ? 'rotate-180 text-indigo-600' : ''" 
                       fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div *ngIf="isZoneDropdownOpen()" 
                     class="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-dropdownFade">
                  <div class="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Filter Office Wing
                  </div>
                  <div class="py-1 space-y-0.5">
                    <button 
                      *ngFor="let zone of availableZones()" 
                      (click)="selectedZone.set(zone); isZoneDropdownOpen.set(false)"
                      class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors text-xs"
                      [ngClass]="zone === selectedZone() ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'">
                      <span class="truncate">{{ zone }}</span>
                      <svg *ngIf="zone === selectedZone()" class="w-4 h-4 text-indigo-600 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>

        <!-- Meeting Rooms Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div *ngFor="let room of filteredRooms()" 
               class="card-surface rounded-3xl p-6 transition-all duration-200 flex flex-col justify-between"
               [ngClass]="room.status === 'Available' ? 'hover:border-indigo-300 hover:shadow-lg' : 'border-amber-200/80 bg-amber-50/15'">
            
            <!-- Room Header -->
            <div>
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div class="flex items-center space-x-2">
                    <span class="text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                      {{ room.code }}
                    </span>
                    <!-- Floor Level Pill -->
                    <span class="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                      Floor {{ room.floorLevel }}
                    </span>
                    <span class="text-xs font-bold text-slate-400 truncate">{{ room.zone }}</span>
                  </div>
                  <h3 class="font-extrabold text-lg text-slate-900 mt-1.5 tracking-tight leading-snug truncate">
                    {{ room.name }}
                  </h3>
                </div>

                <!-- Admin Action Buttons (Visible ONLY to Admin) -->
                <div *ngIf="isAdmin()" class="flex items-center space-x-1 shrink-0">
                  <button 
                    (click)="openEditRoomModal(room)" 
                    title="Edit Room & Capacity"
                    class="p-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 transition-colors">
                    <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button 
                    (click)="deleteRoom(room.id)" 
                    title="Delete Room"
                    class="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition-colors">
                    <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Capacity & Amenities Pill Row (Zero Emoji - Vector SVGs) -->
              <div class="flex flex-wrap items-center gap-2 mb-4">
                <!-- Capacity Badge -->
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold">
                  <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{{ room.capacity }} Seats</span>
                </div>

                <!-- Amenities Pill -->
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold truncate max-w-[210px]">
                  <svg class="w-3.5 h-3.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span class="truncate">{{ room.amenities }}</span>
                </div>
              </div>

              <!-- State Details: Booked vs Available -->
              <div class="rounded-2xl p-3.5 mb-4"
                   [ngClass]="room.status === 'Available' ? 'bg-emerald-50/70 border border-emerald-200/80' : 'bg-white border border-amber-200 shadow-2xs'">
                
                <!-- If Available -->
                <div *ngIf="room.status === 'Available'" class="flex items-center space-x-2.5">
                  <div class="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></div>
                  <div>
                    <div class="text-xs font-bold text-emerald-800">Available for Reservation</div>
                    <div class="text-[11px] font-medium text-emerald-600/90">Instant schedule with attendees</div>
                  </div>
                </div>

                <!-- If Booked (Shows Host, Title, and Invited Facepile with RSVP status) -->
                <div *ngIf="room.status === 'Booked'" class="space-y-2.5">
                  <div>
                    <div class="text-[10px] uppercase tracking-wider font-bold text-amber-800 flex items-center gap-1">
                      <span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                      <span>Booked Session</span>
                    </div>
                    <div class="text-sm font-bold text-slate-900 mt-0.5 truncate">{{ room.title }}</div>
                  </div>

                  <!-- Host Details -->
                  <div class="flex items-center space-x-2 pt-1 border-t border-slate-100">
                    <img [src]="room.hostAvatar" class="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-amber-400" [alt]="room.hostName || ''" />
                    <div class="text-xs truncate">
                      <span class="font-bold text-slate-800">{{ room.hostName }}</span>
                      <span class="text-slate-400 font-medium ml-1">({{ room.hostDepartment }})</span>
                    </div>
                  </div>

                  <!-- Invited Attendees Facepile with RSVP Status Dots -->
                  <div *ngIf="room.attendees.length > 0" class="pt-1.5 border-t border-slate-100">
                    <div class="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                      <span>Participants:</span>
                      <span class="font-bold text-indigo-600">{{ room.attendees.length + 1 }} / {{ room.capacity }} Confirmed</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5 pt-1">
                      <div *ngFor="let att of room.attendees" 
                           class="inline-flex items-center gap-1 bg-slate-50 rounded-full px-2 py-0.5 border text-[10px] font-medium"
                           [ngClass]="{
                             'border-emerald-200 text-emerald-800 bg-emerald-50/60': att.status === 'Accepted',
                             'border-amber-200 text-amber-800 bg-amber-50/60': att.status === 'Pending',
                             'border-slate-200 text-slate-400 line-through bg-slate-50': att.status === 'Declined'
                           }"
                           [title]="att.name + ' (' + att.status + ')'">
                        <img [src]="att.avatarUrl" class="w-4 h-4 rounded-full object-cover shrink-0" [alt]="att.name" />
                        <span class="truncate max-w-[80px]">{{ att.name.split(' ')[0] }}</span>
                        <!-- Status dot -->
                        <span class="w-1.5 h-1.5 rounded-full shrink-0"
                              [ngClass]="{
                                'bg-emerald-500': att.status === 'Accepted',
                                'bg-amber-500 animate-pulse': att.status === 'Pending',
                                'bg-rose-500': att.status === 'Declined'
                              }"></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Action Button -->
            <div>
              <button *ngIf="room.status === 'Available'"
                      (click)="openBookMeetingModal(room)"
                      class="w-full h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2 whitespace-nowrap">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Book & Invite Colleagues</span>
              </button>

              <button *ngIf="room.status === 'Booked' && (room.hostId === currentUserId() || isAdmin())"
                      (click)="cancelBooking(room.bookingId!)"
                      class="w-full h-11 rounded-2xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-bold transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Cancel Scheduled Meeting</span>
              </button>

              <div *ngIf="room.status === 'Booked' && room.hostId !== currentUserId() && !isAdmin()"
                   class="w-full h-11 rounded-2xl bg-slate-100/70 text-slate-400 text-xs font-semibold inline-flex items-center justify-center whitespace-nowrap">
                Occupied by {{ room.hostName }}
              </div>
            </div>

          </div>
        </div>

      </main>

      <!-- 1. Teams-Style Collaborative Booking & Invitation Modal -->
      <div *ngIf="selectedRoomForBooking()" 
           (click)="onBackdropClick($event)"
           class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white border border-slate-200/90 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative" (click)="$event.stopPropagation()">
          
          <button (click)="selectedRoomForBooking.set(null)" 
                  title="Close (Esc)"
                  class="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Modal Header -->
          <div class="flex items-center space-x-3.5">
            <div class="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-extrabold text-base shadow-xs shrink-0">
              {{ selectedRoomForBooking()?.code?.substring(0, 4) }}
            </div>
            <div>
              <h3 class="font-extrabold text-lg text-slate-900">Schedule Meeting & Invite</h3>
              <p class="text-xs font-semibold text-indigo-600">{{ selectedRoomForBooking()?.name }} · Floor {{ selectedRoomForBooking()?.floorLevel }} (Max {{ selectedRoomForBooking()?.capacity }} Seats)</p>
            </div>
          </div>

          <!-- Form Fields -->
          <div class="space-y-4">
            <!-- Meeting Subject -->
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Meeting Title / Topic</label>
              <input 
                type="text" 
                [(ngModel)]="bookingTitle" 
                placeholder="e.g. Q4 Sprint Architecture & Review"
                class="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition" />
            </div>

            <!-- Host & Time Details -->
            <div class="bg-slate-50 rounded-2xl p-3.5 space-y-2 border border-slate-200/80 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-medium">Organizer:</span>
                <span class="font-bold text-slate-800 flex items-center space-x-1.5">
                  <img [src]="currentUser()?.avatarUrl" class="w-5 h-5 rounded-full object-cover shrink-0" [alt]="currentUser()?.name || ''" />
                  <span>{{ currentUser()?.name }}</span>
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-medium">Date & Slot:</span>
                <span class="font-bold text-indigo-600">{{ formattedSelectedDate() }} ({{ selectedSlot() }})</span>
              </div>
            </div>

            <!-- Attendee Invitation Section (Microsoft Teams Style) -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-bold text-slate-700">Invite Colleagues</label>
                <div class="text-xs font-bold"
                     [ngClass]="selectedAttendeeIds().length + 1 > (selectedRoomForBooking()?.capacity || 0) ? 'text-rose-600' : 'text-indigo-600'">
                  {{ selectedAttendeeIds().length + 1 }} / {{ selectedRoomForBooking()?.capacity }} Participants
                </div>
              </div>

              <!-- Quick Invite Buttons -->
              <div class="flex flex-wrap items-center gap-1.5 mb-2">
                <span class="text-[11px] text-slate-400 font-medium mr-1">Quick Invite:</span>
                <button 
                  (click)="inviteDepartment('Engineering')"
                  class="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-bold transition">
                  + Engineering
                </button>
                <button 
                  (click)="inviteDepartment('Product')"
                  class="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-bold transition">
                  + Product
                </button>
                <button 
                  (click)="selectedAttendeeIds.set([])"
                  class="px-2 py-0.5 rounded-lg text-slate-400 hover:text-slate-600 text-[10px] font-semibold ml-auto">
                  Clear
                </button>
              </div>

              <!-- Colleagues Selection List -->
              <div class="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-slate-50 rounded-2xl border border-slate-200">
                <div *ngFor="let emp of otherEmployees()" 
                     (click)="toggleAttendee(emp.id)"
                     class="flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors"
                     [ngClass]="isAttendeeSelected(emp.id) ? 'bg-indigo-50/90 border border-indigo-200 text-indigo-900' : 'hover:bg-white text-slate-700'">
                  <div class="flex items-center space-x-2.5 truncate">
                    <img [src]="emp.avatarUrl" class="w-6 h-6 rounded-full object-cover shrink-0" [alt]="emp.name" />
                    <div class="truncate">
                      <div class="text-xs font-bold truncate">{{ emp.name }}</div>
                      <div class="text-[10px] text-slate-400 truncate">{{ emp.department }}</div>
                    </div>
                  </div>
                  <!-- Vector Checkbox / Checkmark -->
                  <div class="w-5 h-5 rounded-lg flex items-center justify-center shrink-0"
                       [ngClass]="isAttendeeSelected(emp.id) ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white'">
                    <svg *ngIf="isAttendeeSelected(emp.id)" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Submit Button -->
          <div class="pt-2">
            <button (click)="confirmMeetingBooking()" 
                    [disabled]="isSubmitting() || (selectedAttendeeIds().length + 1 > (selectedRoomForBooking()?.capacity || 0))"
                    class="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center">
              {{ isSubmitting() ? 'Scheduling...' : 'Confirm Meeting & Send Invites' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Admin Room Management Modal (Create / Edit Room & Assign Floor) -->
      <div *ngIf="isRoomModalOpen()" 
           (click)="onBackdropClick($event)"
           class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white border border-slate-200/90 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative" (click)="$event.stopPropagation()">
          
          <button (click)="isRoomModalOpen.set(false)" 
                  title="Close (Esc)"
                  class="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Modal Title -->
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-sm shrink-0 border border-purple-100">
              <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 class="font-extrabold text-lg text-slate-900">{{ editingRoomId() ? 'Edit Meeting Room' : 'Add New Meeting Room' }}</h3>
              <p class="text-xs text-purple-600 font-semibold">Admin Workplace Facility Management</p>
            </div>
          </div>

          <!-- Room Form -->
          <div class="space-y-3.5">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Room Name</label>
              <input type="text" [(ngModel)]="roomFormName" placeholder="e.g. Orion Executive Suite"
                     class="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition" />
            </div>

            <!-- Floor Assignment -->
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Building Floor</label>
              <div class="grid grid-cols-3 gap-2">
                <button 
                  *ngFor="let f of floors()"
                  type="button"
                  (click)="roomFormFloorId = f.id"
                  class="h-9 px-2 rounded-xl text-xs font-bold border transition truncate"
                  [ngClass]="roomFormFloorId === f.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'">
                  Level {{ f.level }}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Room Code</label>
                <input type="text" [(ngModel)]="roomFormCode" [disabled]="editingRoomId() !== null" placeholder="e.g. ROOM-301"
                       class="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition disabled:opacity-60" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Capacity (Seats)</label>
                <input type="number" min="1" max="50" [(ngModel)]="roomFormCapacity"
                       class="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Zone / Wing</label>
              <input type="text" [(ngModel)]="roomFormZone" placeholder="e.g. Innovation Bay"
                     class="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Amenities & Equipment</label>
              <input type="text" [(ngModel)]="roomFormAmenities" placeholder="e.g. Teams 4K Video, Dual 75in Displays, Whiteboard"
                     class="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition" />
            </div>
          </div>

          <!-- Save Button -->
          <div class="pt-2">
            <button (click)="saveRoom()" 
                    [disabled]="isSubmitting()"
                    class="w-full h-12 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white text-sm font-bold shadow-md shadow-purple-500/20 transition-all active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center">
              {{ isSubmitting() ? 'Saving...' : (editingRoomId() ? 'Update Room Specifications' : 'Create Meeting Room') }}
            </button>
          </div>
        </div>
      </div>

      <!-- 3. Admin Floor Management Modal (Add Floor, Delete Floor) -->
      <div *ngIf="isManageFloorsModalOpen()" 
           (click)="onBackdropClick($event)"
           class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white border border-slate-200/90 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative" (click)="$event.stopPropagation()">
          
          <button (click)="isManageFloorsModalOpen.set(false)" 
                  title="Close (Esc)"
                  class="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Modal Title -->
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-sm shrink-0 border border-purple-100">
              <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 class="font-extrabold text-lg text-slate-900">Floor Level Management</h3>
              <p class="text-xs text-purple-600 font-semibold">Add or remove facility floors</p>
            </div>
          </div>

          <!-- Existing Floors List -->
          <div class="space-y-2">
            <label class="block text-xs font-bold text-slate-700">Existing Building Floors</label>
            <div class="max-h-48 overflow-y-auto space-y-2 p-1">
              <div *ngFor="let fl of floors()" 
                   class="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/70">
                <div class="flex items-center space-x-3 truncate">
                  <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-extrabold text-xs shrink-0">
                    {{ fl.level }}
                  </div>
                  <div class="truncate">
                    <div class="text-xs font-bold text-slate-900 truncate">{{ fl.name }}</div>
                    <div class="text-[10px] text-slate-400">Level {{ fl.level }}</div>
                  </div>
                </div>
                <button 
                  (click)="deleteFloor(fl.id)"
                  title="Delete Floor"
                  class="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 ml-2">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Add New Floor Form -->
          <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-3">
            <h4 class="text-xs font-bold text-slate-800">Add New Building Floor</h4>
            <div class="grid grid-cols-3 gap-2">
              <div class="col-span-2">
                <input 
                  type="text" 
                  [(ngModel)]="newFloorName" 
                  placeholder="e.g. Floor 16 · AI & Data Lab"
                  class="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 transition" />
              </div>
              <div>
                <input 
                  type="number" 
                  [(ngModel)]="newFloorLevel" 
                  placeholder="Level #"
                  class="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 transition" />
              </div>
            </div>

            <button 
              (click)="createFloor()"
              [disabled]="isSubmitting() || !newFloorName.trim()"
              class="w-full h-10 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Floor</span>
            </button>
          </div>

        </div>
      </div>

    </div>
  `,
  styles: [`
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slideDown {
      animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes dropdownFade {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-dropdownFade {
      animation: dropdownFade 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  `]
})
export class App implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private getBackendUrl(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('deskflow_backend_url');
      if (stored) return stored.replace(/\/$/, '');
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000';
      }
    }
    return 'https://deskflow-production-5f78.up.railway.app';
  }

  private baseUrl = this.getBackendUrl();
  private apiUrl = `${this.baseUrl}/api`;
  private hubUrl = `${this.baseUrl}/hubs/desk`;
  private hubConnection: signalR.HubConnection | null = null;

  // Custom Dropdowns
  isUserDropdownOpen = signal<boolean>(false);
  isZoneDropdownOpen = signal<boolean>(false);
  isFloorDropdownOpen = signal<boolean>(false);

  // Application State Signals
  employees = signal<Employee[]>([]);
  currentUserId = signal<string>('11111111-1111-1111-1111-111111111111'); // Alex Tan (Admin default)
  floors = signal<Floor[]>([]);
  rooms = signal<RoomScheduleItem[]>([]);
  dateOffset = signal<number>(0);
  selectedSlot = signal<string>('FullDay');
  selectedZone = signal<string>('All');
  selectedFloorId = signal<string>('All');

  // Booking Modal State
  selectedRoomForBooking = signal<RoomScheduleItem | null>(null);
  bookingTitle = '';
  selectedAttendeeIds = signal<string[]>([]);
  isSubmitting = signal<boolean>(false);

  // Admin Room Modal State
  isRoomModalOpen = signal<boolean>(false);
  editingRoomId = signal<string | null>(null);
  roomFormName = '';
  roomFormCode = '';
  roomFormFloorId = 'f0000000-0000-0000-0000-000000000014';
  roomFormZone = '';
  roomFormCapacity = 8;
  roomFormAmenities = '';

  // Admin Floor Modal State
  isManageFloorsModalOpen = signal<boolean>(false);
  newFloorName = '';
  newFloorLevel = 16;

  // Toast
  toastMessage = signal<string | null>(null);
  toastType = signal<'success' | 'error'>('success');

  // Computed Values
  currentUser = computed(() => {
    return this.employees().find(e => e.id === this.currentUserId()) || null;
  });

  isAdmin = computed(() => {
    return this.currentUser()?.role === 'Admin';
  });

  otherEmployees = computed(() => {
    return this.employees().filter(e => e.id !== this.currentUserId());
  });

  selectedFloorDisplay = computed(() => {
    if (this.selectedFloorId() === 'All') return 'All Floors';
    const fl = this.floors().find(f => f.id === this.selectedFloorId());
    return fl ? `Floor ${fl.level}` : 'All Floors';
  });

  availableZones = computed(() => {
    const zones = new Set<string>();
    zones.add('All');
    this.rooms().forEach(r => zones.add(r.zone));
    return Array.from(zones);
  });

  filteredRooms = computed(() => {
    let list = this.rooms();
    if (this.selectedFloorId() !== 'All') {
      list = list.filter(r => r.floorId === this.selectedFloorId());
    }
    if (this.selectedZone() !== 'All') {
      list = list.filter(r => r.zone === this.selectedZone());
    }
    return list;
  });

  totalRooms = computed(() => this.rooms().length);
  availableRooms = computed(() => this.rooms().filter(r => r.status === 'Available').length);
  bookedRooms = computed(() => this.rooms().filter(r => r.status === 'Booked').length);
  totalSeats = computed(() => this.rooms().reduce((acc, r) => acc + r.capacity, 0));

  availablePercentage = computed(() => {
    if (this.totalRooms() === 0) return 0;
    return Math.round((this.availableRooms() / this.totalRooms()) * 100);
  });

  myMeetings = computed(() => {
    const uid = this.currentUserId();
    return this.rooms().filter(r => {
      if (r.status !== 'Booked') return false;
      if (r.hostId === uid) return true;
      return r.attendees.some(a => a.employeeId === uid);
    });
  });

  pendingInvitesCount = computed(() => {
    const uid = this.currentUserId();
    return this.rooms().filter(r => 
      r.status === 'Booked' && 
      r.attendees.some(a => a.employeeId === uid && a.status === 'Pending')
    ).length;
  });

  selectedDateString = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + this.dateOffset());
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  formattedSelectedDate = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + this.dateOffset());
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  });

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.selectedRoomForBooking.set(null);
    this.isRoomModalOpen.set(false);
    this.isManageFloorsModalOpen.set(false);
    this.isUserDropdownOpen.set(false);
    this.isZoneDropdownOpen.set(false);
    this.isFloorDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.relative')) {
      this.isUserDropdownOpen.set(false);
      this.isZoneDropdownOpen.set(false);
      this.isFloorDropdownOpen.set(false);
    }
  }

  onBackdropClick(event: MouseEvent) {
    this.selectedRoomForBooking.set(null);
    this.isRoomModalOpen.set(false);
    this.isManageFloorsModalOpen.set(false);
  }

  toggleUserDropdown() {
    this.isUserDropdownOpen.set(!this.isUserDropdownOpen());
    this.isZoneDropdownOpen.set(false);
    this.isFloorDropdownOpen.set(false);
  }

  toggleZoneDropdown() {
    this.isZoneDropdownOpen.set(!this.isZoneDropdownOpen());
    this.isUserDropdownOpen.set(false);
    this.isFloorDropdownOpen.set(false);
  }

  toggleFloorDropdown() {
    this.isFloorDropdownOpen.set(!this.isFloorDropdownOpen());
    this.isUserDropdownOpen.set(false);
    this.isZoneDropdownOpen.set(false);
  }

  ngOnInit() {
    this.loadEmployees();
    this.loadFloors();
    this.loadRoomsSchedule();
    this.initSignalR();
  }

  ngOnDestroy() {
    this.hubConnection?.stop();
  }

  loadEmployees() {
    this.http.get<Employee[]>(`${this.apiUrl}/employees`).subscribe({
      next: (data) => this.employees.set(data),
      error: (err) => console.error('Failed to load employees', err)
    });
  }

  loadFloors() {
    this.http.get<Floor[]>(`${this.apiUrl}/floors`).subscribe({
      next: (data) => {
        this.floors.set(data);
        if (data.length > 0 && !this.roomFormFloorId) {
          this.roomFormFloorId = data[0].id;
        }
      },
      error: (err) => console.error('Failed to load floors', err)
    });
  }

  loadRoomsSchedule() {
    const date = this.selectedDateString();
    const slot = this.selectedSlot();
    this.http.get<RoomScheduleResponse>(`${this.apiUrl}/rooms/schedule?date=${date}&slot=${slot}`).subscribe({
      next: (res) => this.rooms.set(res.rooms),
      error: (err) => console.error('Failed to load rooms schedule', err)
    });
  }

  initSignalR() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl)
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('MeetingBooked', (payload: any) => {
      this.loadRoomsSchedule();
      this.showToast(`Meeting "${payload.title}" scheduled in ${payload.roomName}!`, 'success');
    });

    this.hubConnection.on('MeetingCancelled', (payload: any) => {
      this.loadRoomsSchedule();
      this.showToast(`Meeting in ${payload.roomCode} cancelled.`, 'success');
    });

    this.hubConnection.on('AttendeeRsvpUpdated', (payload: any) => {
      this.loadRoomsSchedule();
      this.showToast(`${payload.employeeName} ${payload.status.toLowerCase()} the invitation!`, 'success');
    });

    this.hubConnection.on('FloorCreated', () => {
      this.loadFloors();
      this.loadRoomsSchedule();
      this.showToast('New floor added to workplace directory.', 'success');
    });

    this.hubConnection.on('FloorDeleted', () => {
      this.loadFloors();
      this.loadRoomsSchedule();
      this.showToast('Floor removed.', 'success');
    });

    this.hubConnection.on('RoomCreated', () => {
      this.loadRoomsSchedule();
      this.showToast('New meeting room added.', 'success');
    });

    this.hubConnection.on('RoomUpdated', () => {
      this.loadRoomsSchedule();
      this.showToast('Meeting room specifications updated.', 'success');
    });

    this.hubConnection.on('RoomDeleted', () => {
      this.loadRoomsSchedule();
      this.showToast('Meeting room removed.', 'success');
    });

    this.hubConnection.on('FloorReset', () => {
      this.loadFloors();
      this.loadRoomsSchedule();
      this.showToast('Room directory refreshed.', 'success');
    });

    this.hubConnection.start().catch((err) => console.error('SignalR Hub Error', err));
  }

  selectUser(id: string) {
    this.currentUserId.set(id);
    this.isUserDropdownOpen.set(false);
  }

  setDateOffset(offset: number) {
    this.dateOffset.set(offset);
    this.loadRoomsSchedule();
  }

  getUserAttendeeStatus(room: RoomScheduleItem): string {
    const att = room.attendees.find(a => a.employeeId === this.currentUserId());
    return att ? att.status : 'Host';
  }

  // RSVP Response for Invitee
  respondToInvite(bookingId: string, status: 'Accepted' | 'Declined') {
    this.http.post(`${this.apiUrl}/bookings/${bookingId}/rsvp`, {
      employeeId: this.currentUserId(),
      status: status
    }).subscribe({
      next: () => {
        this.loadRoomsSchedule();
        this.showToast(`You ${status.toLowerCase()} the invitation.`, 'success');
      },
      error: (err) => {
        this.showToast(err.error?.message || 'Failed to update RSVP.', 'error');
      }
    });
  }

  // Booking Flow & Invitations
  openBookMeetingModal(room: RoomScheduleItem) {
    this.selectedRoomForBooking.set(room);
    this.bookingTitle = '';
    this.selectedAttendeeIds.set([]);
  }

  toggleAttendee(employeeId: string) {
    this.selectedAttendeeIds.update(ids => {
      if (ids.includes(employeeId)) {
        return ids.filter(i => i !== employeeId);
      } else {
        return [...ids, employeeId];
      }
    });
  }

  isAttendeeSelected(employeeId: string): boolean {
    return this.selectedAttendeeIds().includes(employeeId);
  }

  inviteDepartment(dept: string) {
    const peers = this.employees().filter(e => e.department === dept && e.id !== this.currentUserId());
    const peerIds = peers.map(p => p.id);
    this.selectedAttendeeIds.update(current => Array.from(new Set([...current, ...peerIds])));
  }

  confirmMeetingBooking() {
    const room = this.selectedRoomForBooking();
    if (!room) return;

    this.isSubmitting.set(true);
    const body = {
      roomId: room.id,
      hostEmployeeId: this.currentUserId(),
      title: this.bookingTitle || 'Team Collaboration',
      date: this.selectedDateString(),
      slot: this.selectedSlot(),
      invitedEmployeeIds: this.selectedAttendeeIds()
    };

    this.http.post(`${this.apiUrl}/bookings`, body).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.selectedRoomForBooking.set(null);
        this.showToast(`Successfully booked ${room.name}!`, 'success');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.showToast(err.error?.message || 'Booking failed.', 'error');
      }
    });
  }

  cancelBooking(bookingId: string) {
    this.http.delete(`${this.apiUrl}/bookings/${bookingId}`).subscribe({
      next: () => {
        this.showToast('Meeting cancelled successfully.', 'success');
      },
      error: (err) => this.showToast(err.error?.message || 'Cancellation failed.', 'error')
    });
  }

  // Admin Room CRUD
  openAddRoomModal() {
    this.editingRoomId.set(null);
    this.roomFormName = '';
    this.roomFormCode = '';
    this.roomFormFloorId = this.floors().length > 0 ? this.floors()[0].id : '';
    this.roomFormZone = 'Innovation Bay';
    this.roomFormCapacity = 8;
    this.roomFormAmenities = 'Teams 4K Video, Dual Displays, Conference Audio';
    this.isRoomModalOpen.set(true);
  }

  openEditRoomModal(room: RoomScheduleItem) {
    this.editingRoomId.set(room.id);
    this.roomFormName = room.name;
    this.roomFormCode = room.code;
    this.roomFormFloorId = room.floorId;
    this.roomFormZone = room.zone;
    this.roomFormCapacity = room.capacity;
    this.roomFormAmenities = room.amenities;
    this.isRoomModalOpen.set(true);
  }

  saveRoom() {
    if (!this.roomFormName.trim()) {
      this.showToast('Room name is required.', 'error');
      return;
    }

    this.isSubmitting.set(true);
    const editId = this.editingRoomId();

    if (editId) {
      // Update
      const body = {
        name: this.roomFormName,
        floorId: this.roomFormFloorId,
        zone: this.roomFormZone,
        capacity: this.roomFormCapacity,
        amenities: this.roomFormAmenities
      };
      this.http.put(`${this.apiUrl}/rooms/${editId}`, body).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.isRoomModalOpen.set(false);
          this.showToast('Room specifications updated successfully.', 'success');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.showToast(err.error?.message || 'Update failed.', 'error');
        }
      });
    } else {
      // Create
      const body = {
        name: this.roomFormName,
        code: this.roomFormCode,
        floorId: this.roomFormFloorId,
        zone: this.roomFormZone,
        capacity: this.roomFormCapacity,
        amenities: this.roomFormAmenities
      };
      this.http.post(`${this.apiUrl}/rooms`, body).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.isRoomModalOpen.set(false);
          this.showToast('New room added successfully.', 'success');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.showToast(err.error?.message || 'Failed to create room.', 'error');
        }
      });
    }
  }

  deleteRoom(roomId: string) {
    if (!confirm('Are you sure you want to delete this meeting room?')) return;
    this.http.delete(`${this.apiUrl}/rooms/${roomId}`).subscribe({
      next: () => this.showToast('Room deleted successfully.', 'success'),
      error: (err) => this.showToast(err.error?.message || 'Failed to delete room.', 'error')
    });
  }

  // Admin Floor CRUD
  openManageFloorsModal() {
    this.newFloorName = '';
    this.newFloorLevel = 16;
    this.isManageFloorsModalOpen.set(true);
  }

  createFloor() {
    if (!this.newFloorName.trim()) {
      this.showToast('Floor name is required.', 'error');
      return;
    }

    this.isSubmitting.set(true);
    this.http.post(`${this.apiUrl}/floors`, {
      name: this.newFloorName,
      level: this.newFloorLevel
    }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.newFloorName = '';
        this.newFloorLevel += 1;
        this.loadFloors();
        this.showToast('Floor created successfully.', 'success');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.showToast(err.error?.message || 'Failed to create floor.', 'error');
      }
    });
  }

  deleteFloor(floorId: string) {
    if (!confirm('Are you sure you want to delete this floor?')) return;
    this.http.delete(`${this.apiUrl}/floors/${floorId}`).subscribe({
      next: () => {
        this.loadFloors();
        if (this.selectedFloorId() === floorId) {
          this.selectedFloorId.set('All');
        }
        this.showToast('Floor deleted successfully.', 'success');
      },
      error: (err) => {
        this.showToast(err.error?.message || 'Cannot delete floor with assigned rooms.', 'error');
      }
    });
  }

  resetDemoFloor() {
    this.http.post(`${this.apiUrl}/demo/reset`, {}).subscribe({
      next: () => this.showToast('Demo meeting system reset to initial state.', 'success')
    });
  }

  showToast(message: string, type: 'success' | 'error') {
    this.toastMessage.set(message);
    this.toastType.set(type);
    setTimeout(() => {
      if (this.toastMessage() === message) {
        this.toastMessage.set(null);
      }
    }, 4500);
  }
}
