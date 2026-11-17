"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi, AssignmentItem } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { ClipboardList, Send, CheckCircle2 } from "lucide-react";

export default function StudentAssignmentsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AssignmentItem | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["bd-assignments"],
    queryFn: () => bdApi.listAssignments(),
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No assignment selected");
      return bdApi.submitAssignment(selected.id, {
        submissionText: submissionText.trim(),
        attachmentUrl: attachmentUrl.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Homework submitted!");
      qc.invalidateQueries({ queryKey: ["bd-assignments"] });
      setSelected(null);
      setSubmissionText("");
      setAttachmentUrl("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Submission failed"),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Homework & Assignments" />
      <main className="p-5 space-y-6 flex-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            My Homework &amp; Assignments
          </h2>
          <p className="text-sm text-muted-foreground">
            View subject-wise assignments from your teachers and submit your answers before the due date.
          </p>
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
              <Card key={a.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <Badge variant="secondary">{a.subject}</Badge>
                    {a.mySubmission ? (
                      <Badge className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Submitted
                      </Badge>
                    ) : (
                      <Badge variant="outline">Due: {a.due_date}</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base mt-2">{a.title}</CardTitle>
                  <CardDescription>
                    By {a.teacher_name || "Teacher"} &bull; {a.max_marks} Marks
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{a.description}</p>
                  {!a.mySubmission && (
                    <Button size="sm" onClick={() => setSelected(a)}>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Homework
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit: {selected?.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Your Answer / Notes *</Label>
                <Textarea
                  rows={4}
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  placeholder="Write your solution summary or notes here..."
                />
              </div>
              <div className="space-y-1">
                <Label>Attachment Link (Optional Google Drive / PDF URL)</Label>
                <Input
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={!submissionText.trim() || submitMutation.isPending}
                >
                  Submit
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
