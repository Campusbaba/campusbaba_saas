"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { ClipboardList, Plus } from "lucide-react";

export default function TeacherAssignmentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Higher Math");
  const [batchName, setBatchName] = useState("");
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [maxMarks, setMaxMarks] = useState("20");
  const [description, setDescription] = useState("");

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["bd-assignments"],
    queryFn: () => bdApi.listAssignments(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      bdApi.createAssignment({
        title: title.trim(),
        subject: subject.trim(),
        batchName: batchName.trim() || "All Batches",
        dueDate,
        maxMarks: Number(maxMarks) || 20,
        description: description.trim(),
      }),
    onSuccess: () => {
      toast.success("Homework assignment posted");
      qc.invalidateQueries({ queryKey: ["bd-assignments"] });
      setOpen(false);
      setTitle("");
      setDescription("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to post homework"),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Homework & Assignments" />
      <main className="p-5 space-y-6 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Homework &amp; Assignment Manager
            </h2>
            <p className="text-sm text-muted-foreground">
              Post subject-wise homework with due dates and review student submissions.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Post Homework
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Card key={i} className="h-36 animate-pulse bg-muted/40" />
            ))}
          </div>
        ) : assignments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No homework assignments posted yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <Badge variant="secondary">{a.subject}</Badge>
                    <Badge variant="outline">Due: {a.due_date}</Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{a.title}</CardTitle>
                  <CardDescription>
                    {a.batch_name || "All Batches"} &bull; {a.max_marks} Marks &bull; {a.submissionCount || 0} Submissions
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {a.description}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Post Homework Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Exercise 3.2 Problem Set"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Subject *</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Batch</Label>
                  <Input
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="All Batches"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Due Date *</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max Marks</Label>
                  <Input
                    type="number"
                    value={maxMarks}
                    onChange={(e) => setMaxMarks(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Instructions *</Label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Solve questions 1-15 and submit your answer summary or Google Drive PDF link..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!title.trim() || !description.trim() || createMutation.isPending}
                >
                  Post Assignment
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
