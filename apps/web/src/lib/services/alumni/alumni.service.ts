// Alumni Management Service

export interface Alumni {
    id: string;
    name: string;
    email: string;
    phone: string;
    batch: string;
    class: string;
    section: string;
    currentCompany?: string;
    designation?: string;
    location?: string;
    linkedIn?: string;
    photo?: string;
    isVerified: boolean;
    registeredAt: string;
}

export interface AlumniEvent {
    id: string;
    title: string;
    description: string;
    date: string;
    time: string;
    venue: string;
    type: 'reunion' | 'networking' | 'career_talk' | 'workshop' | 'fundraiser';
    organizer: string;
    registrations: number;
    maxCapacity: number;
    status: 'upcoming' | 'ongoing' | 'completed';
}

// Mock Alumni
const mockAlumni: Alumni[] = [
    {
        id: 'a1',
        name: 'Rahul Sharma',
        email: 'rahul.sharma@gmail.com',
        phone: '9876543210',
        batch: '2015',
        class: 'Class 12',
        section: 'A',
        currentCompany: 'Google',
        designation: 'Software Engineer',
        location: 'Bangalore',
        linkedIn: 'linkedin.com/in/rahulsharma',
        isVerified: true,
        registeredAt: '2024-06-15',
    },
    {
        id: 'a2',
        name: 'Priya Patel',
        email: 'priya.patel@yahoo.com',
        phone: '9876543211',
        batch: '2016',
        class: 'Class 12',
        section: 'B',
        currentCompany: 'AIIMS Delhi',
        designation: 'Doctor',
        location: 'Delhi',
        isVerified: true,
        registeredAt: '2024-08-20',
    },
    {
        id: 'a3',
        name: 'Amit Kumar',
        email: 'amit.kumar@outlook.com',
        phone: '9876543212',
        batch: '2018',
        class: 'Class 12',
        section: 'A',
        currentCompany: 'Deloitte',
        designation: 'Consultant',
        location: 'Mumbai',
        linkedIn: 'linkedin.com/in/amitkumar',
        isVerified: true,
        registeredAt: '2024-10-05',
    },
    {
        id: 'a4',
        name: 'Sneha Reddy',
        email: 'sneha.reddy@gmail.com',
        phone: '9876543213',
        batch: '2020',
        class: 'Class 12',
        section: 'C',
        currentCompany: 'Stanford University',
        designation: 'PhD Student',
        location: 'USA',
        isVerified: false,
        registeredAt: '2025-01-10',
    },
    {
        id: 'a5',
        name: 'Vikram Singh',
        email: 'vikram.singh@company.com',
        phone: '9876543214',
        batch: '2012',
        class: 'Class 12',
        section: 'A',
        currentCompany: 'Own Startup',
        designation: 'Founder & CEO',
        location: 'Hyderabad',
        linkedIn: 'linkedin.com/in/vikramsingh',
        isVerified: true,
        registeredAt: '2023-05-15',
    },
];

// Mock Events
const mockEvents: AlumniEvent[] = [
    {
        id: 'e1',
        title: 'Annual Alumni Reunion 2026',
        description: 'Join us for the grand annual reunion with all batches!',
        date: '2026-03-15',
        time: '10:00 AM',
        venue: 'School Auditorium',
        type: 'reunion',
        organizer: 'Alumni Association',
        registrations: 150,
        maxCapacity: 500,
        status: 'upcoming',
    },
    {
        id: 'e2',
        title: 'Tech Networking Evening',
        description: 'Networking event for alumni in technology sector',
        date: '2026-02-20',
        time: '5:00 PM',
        venue: 'Virtual (Zoom)',
        type: 'networking',
        organizer: 'Tech Alumni Group',
        registrations: 45,
        maxCapacity: 100,
        status: 'upcoming',
    },
    {
        id: 'e3',
        title: 'Career Guidance for Class 12',
        description: 'Alumni share experiences and guide current students',
        date: '2026-01-25',
        time: '11:00 AM',
        venue: 'School Conference Hall',
        type: 'career_talk',
        organizer: 'Career Cell',
        registrations: 30,
        maxCapacity: 50,
        status: 'upcoming',
    },
    {
        id: 'e4',
        title: 'Batch of 2015 Reunion',
        description: 'Special reunion for 2015 batch - 10 years celebration!',
        date: '2025-12-20',
        time: '6:00 PM',
        venue: 'Hotel Grand',
        type: 'reunion',
        organizer: 'Batch 2015 Committee',
        registrations: 75,
        maxCapacity: 100,
        status: 'completed',
    },
];

export const AlumniService = {
    // Get all alumni with filters
    getAlumni(filters?: { batch?: string; verified?: boolean }): Alumni[] {
        let result = [...mockAlumni];
        if (filters?.batch) result = result.filter((a) => a.batch === filters.batch);
        if (filters?.verified !== undefined) result = result.filter((a) => a.isVerified === filters.verified);
        return result;
    },

    // Search alumni
    searchAlumni(query: string): Alumni[] {
        const q = query.toLowerCase();
        return mockAlumni.filter(
            (a) =>
                a.name.toLowerCase().includes(q) ||
                a.currentCompany?.toLowerCase().includes(q) ||
                a.designation?.toLowerCase().includes(q)
        );
    },

    // Get alumni stats
    getStats() {
        return {
            total: mockAlumni.length,
            verified: mockAlumni.filter((a) => a.isVerified).length,
            pending: mockAlumni.filter((a) => !a.isVerified).length,
            batches: new Set(mockAlumni.map((a) => a.batch)).size,
        };
    },

    // Get events
    getEvents(status?: string): AlumniEvent[] {
        if (status) return mockEvents.filter((e) => e.status === status);
        return mockEvents;
    },

    // Get event stats
    getEventStats() {
        return {
            upcoming: mockEvents.filter((e) => e.status === 'upcoming').length,
            totalRegistrations: mockEvents.reduce((sum, e) => sum + e.registrations, 0),
        };
    },

    // Get unique batches
    getBatches(): string[] {
        return Array.from(new Set(mockAlumni.map((a) => a.batch))).sort().reverse();
    },
};
