'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DMSService, Folder, Document } from '@/lib/services/dms/dms.service';

export default function DocumentsPage() {
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [showUploadDialog, setShowUploadDialog] = useState(false);

    const stats = DMSService.getStats();
    const rootFolders = DMSService.getRootFolders();
    const subfolders = currentFolder ? DMSService.getSubfolders(currentFolder) : [];
    const currentFolderData = currentFolder ? DMSService.getFolderById(currentFolder) : null;
    const documents = searchQuery
        ? DMSService.searchDocuments(searchQuery)
        : DMSService.getDocuments(currentFolder || undefined);
    const allTags = DMSService.getAllTags();

    const navigateToFolder = (folderId: string | null) => {
        setCurrentFolder(folderId);
        setSearchQuery('');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Document Management</h1>
                    <p className="text-muted-foreground">Store, organize, and share documents</p>
                </div>
                <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                    <DialogTrigger asChild>
                        <Button>⬆️ Upload Document</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Upload Document</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
                                <div className="text-4xl mb-2">📁</div>
                                <p className="font-medium">Drop files here or click to browse</p>
                                <p className="text-sm text-muted-foreground">Supports PDF, DOC, XLS, PPT, Images</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Destination Folder</label>
                                <select className="w-full p-2 border rounded-md">
                                    <option value="">Root</option>
                                    {rootFolders.map((f) => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Tags (comma separated)</label>
                                <Input placeholder="e.g., exam, class10, maths" />
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="share" />
                                <label htmlFor="share" className="text-sm">Share with others</label>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
                                <Button>Upload</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Folders</CardDescription>
                        <CardTitle className="text-3xl">{stats.totalFolders}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Documents</CardDescription>
                        <CardTitle className="text-3xl text-blue-600">{stats.totalDocuments}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Shared</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.sharedDocuments}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Recent Uploads</CardDescription>
                        <CardTitle className="text-3xl text-purple-600">{stats.recentUploads}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Search & Breadcrumb */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigateToFolder(null)}
                                className={!currentFolder ? 'font-bold' : ''}
                            >
                                📂 Root
                            </Button>
                            {currentFolderData && (
                                <>
                                    <span>/</span>
                                    <Button variant="ghost" size="sm" className="font-bold">
                                        {currentFolderData.name}
                                    </Button>
                                </>
                            )}
                        </div>
                        <div className="flex-1">
                            <Input
                                placeholder="Search documents by name or tag..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-4 gap-6">
                {/* Sidebar - Tags */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg">Tags</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {allTags.map((tag) => (
                                <Badge
                                    key={tag}
                                    variant="outline"
                                    className="cursor-pointer hover:bg-blue-50"
                                    onClick={() => setSearchQuery(tag)}
                                >
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Main Content */}
                <div className="col-span-3 space-y-4">
                    {/* Folders */}
                    {!searchQuery && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Folders</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    {(currentFolder ? subfolders : rootFolders).map((folder) => (
                                        <div
                                            key={folder.id}
                                            onClick={() => navigateToFolder(folder.id)}
                                            className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-3xl">📁</span>
                                                <div>
                                                    <p className="font-medium">{folder.name}</p>
                                                    <p className="text-sm text-muted-foreground">{folder.itemCount} items</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(currentFolder ? subfolders : rootFolders).length === 0 && (
                                        <p className="text-muted-foreground col-span-3 text-center py-4">No subfolders</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Documents */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                {searchQuery ? `Search Results for "${searchQuery}"` : 'Documents'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {documents.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{DMSService.getFileIcon(doc.type)}</span>
                                            <div>
                                                <p className="font-medium">{doc.name}</p>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <span>{doc.size}</span>
                                                    <span>•</span>
                                                    <span>v{doc.version}</span>
                                                    <span>•</span>
                                                    <span>{doc.uploadedBy}</span>
                                                    <span>•</span>
                                                    <span>{doc.uploadedAt}</span>
                                                </div>
                                                <div className="flex gap-1 mt-1">
                                                    {doc.tags.map((tag) => (
                                                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {doc.isShared && <Badge className="bg-green-100 text-green-800">Shared</Badge>}
                                            <Button size="sm" variant="outline" onClick={() => setSelectedDoc(doc)}>View</Button>
                                            <Button size="sm" variant="ghost">⬇️</Button>
                                        </div>
                                    </div>
                                ))}
                                {documents.length === 0 && (
                                    <p className="text-center py-8 text-muted-foreground">No documents found</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Document Details Dialog */}
            {selectedDoc && (
                <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{selectedDoc.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="flex items-center justify-center p-8 bg-gray-100 rounded-lg">
                                <span className="text-6xl">{DMSService.getFileIcon(selectedDoc.type)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-muted-foreground">Size:</span> {selectedDoc.size}</div>
                                <div><span className="text-muted-foreground">Version:</span> {selectedDoc.version}</div>
                                <div><span className="text-muted-foreground">Uploaded by:</span> {selectedDoc.uploadedBy}</div>
                                <div><span className="text-muted-foreground">Date:</span> {selectedDoc.uploadedAt}</div>
                            </div>
                            {selectedDoc.isShared && (
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">Shared with:</p>
                                    <div className="flex gap-2">
                                        {selectedDoc.sharedWith?.map((s) => (
                                            <Badge key={s} variant="outline">{s}</Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-2 pt-4">
                                <Button className="flex-1">⬇️ Download</Button>
                                <Button variant="outline" className="flex-1">🔗 Share</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
