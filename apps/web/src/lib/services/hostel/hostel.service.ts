// Hostel Management Service

export interface Hostel {
    id: string;
    name: string;
    type: 'boys' | 'girls';
    warden: string;
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    address: string;
}

export interface Room {
    id: string;
    hostelId: string;
    roomNumber: string;
    floor: number;
    type: 'single' | 'double' | 'triple' | 'dormitory';
    totalBeds: number;
    occupiedBeds: number;
    amenities: string[];
    status: 'available' | 'full' | 'maintenance';
}

export interface HostelAllocation {
    id: string;
    studentId: string;
    studentName: string;
    class: string;
    hostelId: string;
    hostelName: string;
    roomId: string;
    roomNumber: string;
    bedNumber: string;
    allocatedFrom: string;
    allocatedTo: string;
    status: 'active' | 'vacated' | 'pending';
}

export interface MessMenu {
    day: string;
    breakfast: string;
    lunch: string;
    snacks: string;
    dinner: string;
}

// Mock Data
const mockHostels: Hostel[] = [
    {
        id: 'h1',
        name: 'Vivekananda Boys Hostel',
        type: 'boys',
        warden: 'Mr. Ramesh Sharma',
        totalRooms: 50,
        totalBeds: 150,
        occupiedBeds: 120,
        address: 'Campus Block A',
    },
    {
        id: 'h2',
        name: 'Sarojini Girls Hostel',
        type: 'girls',
        warden: 'Mrs. Anita Gupta',
        totalRooms: 40,
        totalBeds: 120,
        occupiedBeds: 95,
        address: 'Campus Block B',
    },
];

const mockRooms: Room[] = [
    { id: 'r1', hostelId: 'h1', roomNumber: '101', floor: 1, type: 'triple', totalBeds: 3, occupiedBeds: 3, amenities: ['AC', 'Attached Bath'], status: 'full' },
    { id: 'r2', hostelId: 'h1', roomNumber: '102', floor: 1, type: 'triple', totalBeds: 3, occupiedBeds: 2, amenities: ['Fan', 'Common Bath'], status: 'available' },
    { id: 'r3', hostelId: 'h1', roomNumber: '103', floor: 1, type: 'double', totalBeds: 2, occupiedBeds: 2, amenities: ['AC', 'Attached Bath'], status: 'full' },
    { id: 'r4', hostelId: 'h1', roomNumber: '201', floor: 2, type: 'triple', totalBeds: 3, occupiedBeds: 0, amenities: ['Fan', 'Common Bath'], status: 'maintenance' },
    { id: 'r5', hostelId: 'h2', roomNumber: 'G01', floor: 0, type: 'double', totalBeds: 2, occupiedBeds: 2, amenities: ['AC', 'Attached Bath'], status: 'full' },
    { id: 'r6', hostelId: 'h2', roomNumber: 'G02', floor: 0, type: 'double', totalBeds: 2, occupiedBeds: 1, amenities: ['AC', 'Attached Bath'], status: 'available' },
];

const mockAllocations: HostelAllocation[] = [
    { id: 'a1', studentId: 'STU001', studentName: 'Rahul Sharma', class: 'Class 10-A', hostelId: 'h1', hostelName: 'Vivekananda Boys Hostel', roomId: 'r1', roomNumber: '101', bedNumber: 'A', allocatedFrom: '2026-04-01', allocatedTo: '2027-03-31', status: 'active' },
    { id: 'a2', studentId: 'STU002', studentName: 'Amit Kumar', class: 'Class 10-B', hostelId: 'h1', hostelName: 'Vivekananda Boys Hostel', roomId: 'r1', roomNumber: '101', bedNumber: 'B', allocatedFrom: '2026-04-01', allocatedTo: '2027-03-31', status: 'active' },
    { id: 'a3', studentId: 'STU003', studentName: 'Priya Patel', class: 'Class 9-A', hostelId: 'h2', hostelName: 'Sarojini Girls Hostel', roomId: 'r5', roomNumber: 'G01', bedNumber: 'A', allocatedFrom: '2026-04-01', allocatedTo: '2027-03-31', status: 'active' },
    { id: 'a4', studentId: 'STU010', studentName: 'Sneha Reddy', class: 'Class 11-A', hostelId: 'h2', hostelName: 'Sarojini Girls Hostel', roomId: 'r6', roomNumber: 'G02', bedNumber: 'A', allocatedFrom: '2026-04-01', allocatedTo: '2027-03-31', status: 'active' },
];

const mockMessMenu: MessMenu[] = [
    { day: 'Monday', breakfast: 'Poha, Tea, Fruits', lunch: 'Dal, Rice, Roti, Sabzi, Salad', snacks: 'Samosa, Tea', dinner: 'Paneer Butter Masala, Roti, Rice, Dessert' },
    { day: 'Tuesday', breakfast: 'Idli, Sambar, Chutney', lunch: 'Rajma, Rice, Roti, Raita', snacks: 'Bread Pakora, Tea', dinner: 'Mixed Veg, Roti, Dal Fry, Rice' },
    { day: 'Wednesday', breakfast: 'Paratha, Curd, Pickle', lunch: 'Chole, Rice, Bhatura, Salad', snacks: 'Veg Sandwich, Juice', dinner: 'Dal Makhani, Jeera Rice, Roti' },
    { day: 'Thursday', breakfast: 'Upma, Coconut Chutney', lunch: 'Kadhi Pakora, Rice, Roti', snacks: 'Biscuits, Tea', dinner: 'Palak Paneer, Roti, Rice, Papad' },
    { day: 'Friday', breakfast: 'Aloo Paratha, Curd', lunch: 'Seasonal Sabzi, Dal, Rice, Roti', snacks: 'Pav Bhaji', dinner: 'Biryani, Raita, Salad' },
    { day: 'Saturday', breakfast: 'Chole Bhature', lunch: 'Dal Tadka, Rice, Roti, Fry', snacks: 'Maggi, Juice', dinner: 'Matar Paneer, Roti, Rice' },
    { day: 'Sunday', breakfast: 'Puri Sabzi, Halwa', lunch: 'Special Thali', snacks: 'Ice Cream', dinner: 'Malai Kofta, Naan, Pulao, Dessert' },
];

export const HostelService = {
    // Get all hostels
    getHostels(): Hostel[] {
        return mockHostels;
    },

    // Get hostel by ID
    getHostelById(id: string): Hostel | undefined {
        return mockHostels.find((h) => h.id === id);
    },

    // Get rooms for a hostel
    getRooms(hostelId?: string): Room[] {
        if (hostelId) return mockRooms.filter((r) => r.hostelId === hostelId);
        return mockRooms;
    },

    // Get allocations
    getAllocations(filters?: { hostelId?: string; status?: string }): HostelAllocation[] {
        let result = [...mockAllocations];
        if (filters?.hostelId) result = result.filter((a) => a.hostelId === filters.hostelId);
        if (filters?.status) result = result.filter((a) => a.status === filters.status);
        return result;
    },

    // Get mess menu
    getMessMenu(): MessMenu[] {
        return mockMessMenu;
    },

    // Get overall stats
    getStats() {
        return {
            totalHostels: mockHostels.length,
            totalBeds: mockHostels.reduce((sum, h) => sum + h.totalBeds, 0),
            occupiedBeds: mockHostels.reduce((sum, h) => sum + h.occupiedBeds, 0),
            availableBeds: mockHostels.reduce((sum, h) => sum + (h.totalBeds - h.occupiedBeds), 0),
            occupancyRate: Math.round(
                (mockHostels.reduce((sum, h) => sum + h.occupiedBeds, 0) /
                    mockHostels.reduce((sum, h) => sum + h.totalBeds, 0)) * 100
            ),
        };
    },

    // Get room status color
    getRoomStatusColor(status: string): string {
        const colors: Record<string, string> = {
            available: 'bg-green-100 text-green-800',
            full: 'bg-red-100 text-red-800',
            maintenance: 'bg-yellow-100 text-yellow-800',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    },
};
