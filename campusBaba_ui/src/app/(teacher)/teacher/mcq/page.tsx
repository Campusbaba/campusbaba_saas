"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { CheckSquare, Plus, Trash2 } from "lucide-react";

interface DraftQuestion {
  questionText: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  marks: number;
}

const emptyQuestion = (): DraftQuestion => ({
  questionText: "",
  options: ["", "", "", ""],
  correctOptionIndex: 0,
  marks: 1,
});

export default function TeacherMcqPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Physics");
  const [batchName, setBatchName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [negativeMark, setNegativeMark] = useState("0.25");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ["bd-mcq-quizzes"],
    queryFn: () => bdApi.listMcqQuizzes(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      bdApi.createMcqQuiz({
        title: title.trim(),
        subject: subject.trim(),
        batchName: batchName.trim() || "All Batches",
        durationMinutes: Number(durationMinutes) || 20,
        negativeMarkPerWrong: Number(negativeMark) || 0,
        questions: questions.map((q) => ({
          questionText: q.questionText.trim(),
          options: q.options.map((o) => o.trim()),
          correctOptionIndex: q.correctOptionIndex,
          marks: Number(q.marks) || 1,
        })),
      }),
    onSuccess: () => {
      toast.success("MCQ Model Test published");
      qc.invalidateQueries({ queryKey: ["bd-mcq-quizzes"] });
      setOpen(false);
      setTitle("");
      setQuestions([emptyQuestion()]);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to publish MCQ"),
  });

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function updateOption(qIdx: number, oIdx: number, val: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const nextOpts = [...q.options] as [string, string, string, string];
        nextOpts[oIdx] = val;
        return { ...q, options: nextOpts };
      })
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="MCQ Model Tests" />
      <main className="p-5 space-y-6 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Online MCQ Practice &amp; Model Tests
            </h2>
            <p className="text-sm text-muted-foreground">
              Build subject-wise MCQ quizzes with configurable negative marking (default -0.25) and instant student auto-grading.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create MCQ Test
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2].map((i) => (
              <Card key={i} className="h-36 animate-pulse bg-muted/40" />
            ))}
          </div>
        ) : quizzes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No MCQ tests created yet. Click &quot;Create MCQ Test&quot; to publish your first model test.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((qz) => (
              <Card key={qz.id}>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <Badge variant="secondary">{qz.subject}</Badge>
                    <Badge variant="outline">{qz.questions.length} Qs</Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{qz.title}</CardTitle>
                  <CardDescription>
                    {qz.batch_name || "All Batches"} &bull; {qz.duration_minutes} mins &bull; Negative: -{qz.negative_mark_per_wrong}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create MCQ Model Test</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Test Title *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Physics Chapter 2 Weekly MCQ"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Subject *</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Batch</Label>
                  <Input
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="HSC-26 Batch A"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Duration (min)</Label>
                    <Input
                      type="number"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Negative / Wrong</Label>
                    <Input
                      type="number"
                      step="0.05"
                      value={negativeMark}
                      onChange={(e) => setNegativeMark(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {questions.map((q, qIdx) => (
                  <Card key={qIdx} className="p-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold">Question {qIdx + 1}</Label>
                      {questions.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() =>
                            setQuestions((prev) => prev.filter((_, i) => i !== qIdx))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Input
                      placeholder="Enter question text..."
                      value={q.questionText}
                      onChange={(e) => updateQuestion(qIdx, { questionText: e.target.value })}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={q.correctOptionIndex === oIdx}
                            onChange={() => updateQuestion(qIdx, { correctOptionIndex: oIdx })}
                          />
                          <Input
                            placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                            value={opt}
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!title.trim() || createMutation.isPending}
                >
                  Publish MCQ Test
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
