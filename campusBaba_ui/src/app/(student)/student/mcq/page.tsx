"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi, McqQuiz } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { CheckSquare, Play, Award } from "lucide-react";

export default function StudentMcqPage() {
  const qc = useQueryClient();
  const [activeQuiz, setActiveQuiz] = useState<McqQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [lastResult, setLastResult] = useState<any | null>(null);

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ["bd-mcq-quizzes"],
    queryFn: () => bdApi.listMcqQuizzes(),
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["bd-mcq-submissions"],
    queryFn: () => bdApi.listMcqSubmissions(),
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!activeQuiz) throw new Error("No active quiz");
      const payload = activeQuiz.questions.map((q) => ({
        questionId: q.questionId,
        selectedOptionIndex: answers[q.questionId] ?? null,
      }));
      return bdApi.submitMcqAttempt(activeQuiz.id, payload);
    },
    onSuccess: (res) => {
      toast.success("Quiz evaluated!");
      setLastResult(res.evaluation);
      qc.invalidateQueries({ queryKey: ["bd-mcq-submissions"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to submit quiz"),
  });

  function startQuiz(qz: McqQuiz) {
    setActiveQuiz(qz);
    setAnswers({});
    setLastResult(null);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="MCQ Practice & Model Tests" />
      <main className="p-5 space-y-6 flex-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            Online MCQ Practice &amp; Instant Scorecards
          </h2>
          <p className="text-sm text-muted-foreground">
            Attempt teacher-published MCQ model tests and view your auto-graded score with negative marking.
          </p>
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
              No MCQ model tests available yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((qz) => (
              <Card key={qz.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <Badge variant="secondary">{qz.subject}</Badge>
                    <Badge variant="outline">{qz.questions.length} Qs</Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{qz.title}</CardTitle>
                  <CardDescription>
                    {qz.duration_minutes} mins &bull; Negative: -{qz.negative_mark_per_wrong}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" size="sm" onClick={() => startQuiz(qz)}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Test
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {submissions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                My Previous Attempts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {submissions.map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border rounded-md p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{s.quiz_title}</div>
                    <div className="text-xs text-muted-foreground">{s.subject}</div>
                  </div>
                  <Badge>
                    Score: {s.evaluation?.netMarks ?? 0} / {s.evaluation?.maxPossibleMarks ?? 0}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Dialog open={!!activeQuiz} onOpenChange={(o) => !o && setActiveQuiz(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {activeQuiz?.title} ({activeQuiz?.subject})
              </DialogTitle>
            </DialogHeader>

            {lastResult ? (
              <div className="space-y-4 py-4 text-center">
                <Award className="h-12 w-12 mx-auto text-primary" />
                <h3 className="text-2xl font-bold">
                  Net Score: {lastResult.netMarks} / {lastResult.maxPossibleMarks}
                </h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Correct</div>
                    <div className="font-semibold text-emerald-600">{lastResult.correct}</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Wrong</div>
                    <div className="font-semibold text-destructive">{lastResult.wrong}</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-muted-foreground">Skipped</div>
                    <div className="font-semibold">{(lastResult.totalQuestions ?? 0) - (lastResult.attempted ?? 0)}</div>
                  </div>
                </div>
                <Button onClick={() => setActiveQuiz(null)}>Close</Button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeQuiz?.questions.map((q, idx) => (
                  <Card key={q.questionId} className="p-4 space-y-2">
                    <div className="font-medium text-sm">
                      {idx + 1}. {q.questionText}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt, oIdx) => (
                        <label
                          key={oIdx}
                          className="flex items-center gap-2 border rounded-md p-2 text-sm cursor-pointer hover:bg-muted/40"
                        >
                          <input
                            type="radio"
                            name={`ans-${q.questionId}`}
                            checked={answers[q.questionId] === oIdx}
                            onChange={() =>
                              setAnswers((prev) => ({ ...prev, [q.questionId]: oIdx }))
                            }
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </Card>
                ))}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setActiveQuiz(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending ? "Grading..." : "Submit Answers"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
