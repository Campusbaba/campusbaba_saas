"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bdApi, StudyMaterial } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
  BookOpen,
  FileText,
  Upload,
  Download,
  Eye,
  Trash2,
  Search,
  FolderOpen,
  Library,
} from "lucide-react";

interface StudyLibraryViewProps {
  canUpload?: boolean;
  showPhysicalCatalog?: boolean;
}

const DEFAULT_SUBJECTS = [
  "Physics",
  "Chemistry",
  "Higher Math",
  "Biology",
  "English",
  "Bangla",
  "ICT",
  "General Knowledge",
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function StudyLibraryView({
  canUpload = false,
  showPhysicalCatalog = true,
}: StudyLibraryViewProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  // PDF Reader modal state
  const [previewItem, setPreviewItem] = useState<StudyMaterial | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Upload form state
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Physics");
  const [batchName, setBatchName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Physical book form state (admin/teacher)
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [bookCategory, setBookCategory] = useState("Reference");
  const [bookBarcode, setBookBarcode] = useState("");
  const [bookCopies, setBookCopies] = useState("5");

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["bd-materials"],
    queryFn: () => bdApi.listMaterials(),
  });

  const { data: books = [] } = useQuery({
    queryKey: ["bd-library-books"],
    queryFn: () => bdApi.listBooks(),
    enabled: showPhysicalCatalog,
    retry: false,
  });

  const subjects = useMemo(() => {
    const set = new Set<string>(materials.map((m) => m.subject).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (selectedSubject !== "all" && m.subject !== selectedSubject) return false;
      if (q) {
        const hay = `${m.title} ${m.subject} ${m.batch_name || ""} ${m.original_name} ${m.description || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [materials, selectedSubject, search]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("Please select a PDF file");
      if (!title.trim() || !subject.trim()) throw new Error("Title and subject are required");
      const base64Content = await fileToBase64(selectedFile);
      return bdApi.uploadMaterial({
        title: title.trim(),
        subject: subject.trim(),
        batchName: batchName.trim() || "All Batches",
        description: description.trim(),
        originalName: selectedFile.name,
        mimeType: selectedFile.type || "application/pdf",
        base64Content,
      });
    },
    onSuccess: () => {
      toast.success("Lecture sheet uploaded to Study Library");
      qc.invalidateQueries({ queryKey: ["bd-materials"] });
      setUploadOpen(false);
      setTitle("");
      setBatchName("");
      setDescription("");
      setSelectedFile(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err.message || "Upload failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bdApi.deleteMaterial(id),
    onSuccess: () => {
      toast.success("Material removed");
      qc.invalidateQueries({ queryKey: ["bd-materials"] });
    },
    onError: () => toast.error("Failed to remove material"),
  });

  const addBookMutation = useMutation({
    mutationFn: () =>
      bdApi.createBook({
        barcode: bookBarcode.trim() || `BK-${Date.now().toString().slice(-6)}`,
        title: bookTitle.trim(),
        author: bookAuthor.trim() || "Staff",
        category: bookCategory.trim() || "Reference",
        totalCopies: Number(bookCopies) || 1,
      }),
    onSuccess: () => {
      toast.success("Book added to library catalog");
      qc.invalidateQueries({ queryKey: ["bd-library-books"] });
      setBookTitle("");
      setBookAuthor("");
      setBookBarcode("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to add book"),
  });

  async function handleReadPdf(item: StudyMaterial) {
    setPreviewItem(item);
    setLoadingPdf(true);
    try {
      const url = await bdApi.fetchMaterialBlobUrl(item.id, false);
      setPreviewUrl(url);
    } catch {
      toast.error("Could not load PDF preview");
      setPreviewItem(null);
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleDownloadPdf(item: StudyMaterial) {
    try {
      const url = await bdApi.fetchMaterialBlobUrl(item.id, true);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.original_name || `${item.title}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast.error("Failed to download PDF");
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewItem(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Digital Study Library &amp; Subject-Wise Lecture Sheets
          </h2>
          <p className="text-sm text-muted-foreground">
            Browse, read inline, or download teacher-uploaded PDF lecture sheets organized by subject and batch.
          </p>
        </div>
        {canUpload && (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Lecture Sheet (PDF)
          </Button>
        )}
      </div>

      <Tabs defaultValue="sheets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sheets" className="gap-2">
            <FileText className="h-4 w-4" />
            Lecture Sheets ({materials.length})
          </TabsTrigger>
          {showPhysicalCatalog && (
            <TabsTrigger value="books" className="gap-2">
              <Library className="h-4 w-4" />
              Physical Library Catalog ({books.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sheets" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by topic, subject, or batch..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {subjects.map((subj) => (
                <Button
                  key={subj}
                  variant={selectedSubject === subj ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSubject(subj)}
                >
                  {subj === "all" ? "All Subjects" : subj}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-44 animate-pulse bg-muted/40" />
              ))}
            </div>
          ) : filteredMaterials.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="font-medium">No lecture sheets found</p>
                <p className="text-sm text-muted-foreground">
                  {canUpload
                    ? "Upload a subject-wise PDF lecture sheet so students can read it in their library."
                    : "Your teachers have not uploaded lecture sheets for this filter yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map((item) => (
                <Card key={item.id} className="flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary">{item.subject}</Badge>
                      {item.batch_name && (
                        <Badge variant="outline">{item.batch_name}</Badge>
                      )}
                    </div>
                    <CardTitle className="text-base mt-2 leading-snug">
                      {item.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {item.description || item.original_name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>By {item.uploaded_by_name || "Teacher"}</span>
                      <span>{(Number(item.size_bytes || 0) / 1024).toFixed(0)} KB</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleReadPdf(item)}
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        Read PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadPdf(item)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canUpload && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {showPhysicalCatalog && (
          <TabsContent value="books" className="space-y-4">
            {canUpload && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add Reference Book to Catalog</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <Input
                    placeholder="Book Title"
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                  />
                  <Input
                    placeholder="Author"
                    value={bookAuthor}
                    onChange={(e) => setBookAuthor(e.target.value)}
                  />
                  <Input
                    placeholder="Category"
                    value={bookCategory}
                    onChange={(e) => setBookCategory(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Copies"
                    value={bookCopies}
                    onChange={(e) => setBookCopies(e.target.value)}
                  />
                  <Button
                    onClick={() => addBookMutation.mutate()}
                    disabled={!bookTitle.trim() || addBookMutation.isPending}
                  >
                    Add Book
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {books.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No physical library books cataloged yet.
                  </CardContent>
                </Card>
              ) : (
                books.map((b: any) => (
                  <Card key={b.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <Badge variant="outline">{b.category}</Badge>
                        <Badge variant={b.available_copies > 0 ? "default" : "destructive"}>
                          {b.available_copies}/{b.total_copies} Available
                        </Badge>
                      </div>
                      <CardTitle className="text-base mt-2">{b.title}</CardTitle>
                      <CardDescription>{b.author} &bull; {b.barcode}</CardDescription>
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Upload PDF Modal */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Subject-Wise Lecture Sheet (PDF)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Sheet Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Chapter 3: Vector & Kinematics Sheet 01"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Subject *</Label>
                <Input
                  list="bd-subjects-list"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Physics"
                />
                <datalist id="bd-subjects-list">
                  {DEFAULT_SUBJECTS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Batch / Class</Label>
                <Input
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g., HSC-26 Science Batch A"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Short Notes / Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Key formulas, solved board questions, and practice sheet..."
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>PDF File *</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload Sheet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline PDF Reader Modal */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span>
                {previewItem?.title} ({previewItem?.subject})
              </span>
              {previewItem && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadPdf(previewItem)}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 border rounded-md overflow-hidden bg-muted/20">
            {loadingPdf ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Loading PDF document...
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                title={previewItem?.title || "PDF Preview"}
                className="w-full h-full"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
