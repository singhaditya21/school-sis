export interface Hostel {
    id: string;
    name: string;
    type: 'boys' | 'girls';
    warden: string;
    totalRooms: number;
    occupiedRooms: number;
    capacity: number;
    currentOccupancy: number;
}

export interface HostelRoom {
    id: string;
    hostelId: string;
    roomNumber: string;
    floor: number;
    capacity: number;
    occupants: number;
    type: 'single' | 'double' | 'dormitory';
    status: 'available' | 'occupied' | 'maintenance';
}