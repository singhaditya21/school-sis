// Document Management Service

export interface Folder {
    id: string;
    name: string;
    parentId?: string;
    path: string;
    createdAt: string;
    updatedAt: string;
    itemCount: number;
}

export interface Document {
    id: string;
    name: string;
    folderId: string;
    type: 'pdf' | 'doc' | 'xls' | 'ppt' | 'image' | 'other';
    size: string;
    tags: string[];
    uploadedBy: string;
    uploadedAt: string;
    updatedAt: string;
    version: number;
    isShared: boolean;
    sharedWith?: string[];
}

// Mock Folders
const mockFolders: Folder[] = [
    { id: 'f1', name: 'Academic Documents', path: '/Academic Documents', createdAt: '2026-01-01', updatedAt: '2026-01-20', itemCount: 15 },
    { id: 'f2', name: 'Administrative', path: '/Administrative', createdAt: '2026-01-01', updatedAt: '2026-01-18', itemCount: 8 },
    { id: 'f3', name: 'Circulars', path: '/Circulars', createdAt: '2026-01-01', updatedAt: '2026-01-22', itemCount: 25 },
    { id: 'f4', name: 'Exam Papers', parentId: 'f1', path: '/Academic Documents/Exam Papers', createdAt: '2026-01-05', updatedAt: '2026-01-15', itemCount: 42 },
    { id: 'f5', name: 'Syllabus', parentId: 'f1', path: '/Academic Documents/Syllabus', createdAt: '2026-01-05', updatedAt: '2026-01-10', itemCount: 12 },
    { id: 'f6', name: 'HR Policies', parentId: 'f2', path: '/Administrative/HR Policies', createdAt: '2026-01-10', updatedAt: '2026-01-10', itemCount: 5 },
];

// Mock Documents
const mockDocuments: Document[] = [
    {
        id: 'd1',
        name: 'Annual Academic Calendar 2026.pdf',
        folderId: 'f1',
        type: 'pdf',
        size: '2.5 MB',
        tags: ['calendar', 'academic', '2026'],
        uploadedBy: 'Admin',
        uploadedAt: '2026-01-05',
        updatedAt: '2026-01-05',
        version: 1,
        isShared: true,
        sharedWith: ['All Staff', 'All Parents'],
    },
    {
        id: 'd2',
        name: 'Class 10 Maths Question Paper.pdf',
        folderId: 'f4',
        type: 'pdf',
        size: '1.2 MB',
        tags: ['exam', 'maths', 'class10'],
        uploadedBy: 'Mrs. Gupta',
        uploadedAt: '2026-01-15',
        updatedAt: '2026-01-15',
        version: 1,
        isShared: false,
    },
    {
        id: 'd3',
        name: 'Staff Leave Policy.docx',
        folderId: 'f6',
        type: 'doc',
        size: '450 KB',
        tags: ['policy', 'leave', 'hr'],
        uploadedBy: 'HR Manager',
        uploadedAt: '2026-01-10',
        updatedAt: '2026-01-10',
        version: 2,
        isShared: true,
        sharedWith: ['All Staff'],
    },
    {
        id: 'd4',
        name: 'Fee Structure 2026-27.xlsx',
        folderId: 'f2',
        type: 'xls',
        size: '320 KB',
        tags: ['fees', 'finance'],
        uploadedBy: 'Accounts',
        uploadedAt: '2026-01-08',
        updatedAt: '2026-01-08',
        version: 1,
        isShared: true,
    },
    {
        id: 'd5',
        name: 'PTM Circular January.pdf',
        folderId: 'f3',
        type: 'pdf',
        size: '150 KB',
        tags: ['circular', 'ptm', 'parents'],
        uploadedBy: 'Admin',
        uploadedAt: '2026-01-20',
        updatedAt: '2026-01-20',
        version: 1,
        isShared: true,
        sharedWith: ['All Parents'],
    },
    {
        id: 'd6',
        name: 'Sports Day Presentation.pptx',
        folderId: 'f2',
        type: 'ppt',
        size: '8.5 MB',
        tags: ['sports', 'event', 'presentation'],
        uploadedBy: 'Sports Dept',
        uploadedAt: '2026-01-18',
        updatedAt: '2026-01-18',
        version: 1,
        isShared: false,
    },
];

export const DMSService = {
    // Get all root folders
    getRootFolders(): Folder[] {
        return mockFolders.filter((f) => !f.parentId);
    },

    // Get subfolders
    getSubfolders(parentId: string): Folder[] {
        return mockFolders.filter((f) => f.parentId === parentId);
    },

    // Get folder by ID
    getFolderById(id: string): Folder | undefined {
        return mockFolders.find((f) => f.id === id);
    },

    // Get documents in folder
    getDocuments(folderId?: string): Document[] {
        if (folderId) return mockDocuments.filter((d) => d.folderId === folderId);
        return mockDocuments;
    },

    // Search documents
    searchDocuments(query: string): Document[] {
        const q = query.toLowerCase();
        return mockDocuments.filter(
            (d) =>
                d.name.toLowerCase().includes(q) ||
                d.tags.some((t) => t.toLowerCase().includes(q))
        );
    },

    // Get documents by tag
    getDocumentsByTag(tag: string): Document[] {
        return mockDocuments.filter((d) => d.tags.includes(tag));
    },

    // Get stats
    getStats() {
        return {
            totalFolders: mockFolders.length,
            totalDocuments: mockDocuments.length,
            sharedDocuments: mockDocuments.filter((d) => d.isShared).length,
            recentUploads: mockDocuments.filter((d) => {
                const uploadDate = new Date(d.uploadedAt);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return uploadDate >= weekAgo;
            }).length,
        };
    },

    // Get file icon
    getFileIcon(type: string): string {
        const icons: Record<string, string> = {
            pdf: '📄',
            doc: '📝',
            xls: '📊',
            ppt: '📽️',
            image: '🖼️',
            other: '📁',
        };
        return icons[type] || '📁';
    },

    // Get all unique tags
    getAllTags(): string[] {
        const tags = new Set<string>();
        mockDocuments.forEach((d) => d.tags.forEach((t) => tags.add(t)));
        return Array.from(tags);
    },
};
