"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi, CoachingBatch } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { Layers, Plus, UserPlus, Users, Clock } from "lucide-react";

export default function AdminBatchesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [enrollBatch, setEnrollBatch] = useState<CoachingBatch | null>(null);

  const [batchCode, setBatchCode] = useState("");
  const [name, setName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("2500");
  const [maxCapacity, setMaxCapacity] = useState("40");

  const [studentId, setStudentId] = useState("");
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["bd-batches"],
    queryFn: () => bdApi.listBatches(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      bdApi.createBatch({
        batchCode: batchCode.trim(),
        name: name.trim(),
        courseName: courseName.trim(),
        monthlyFee: Number(monthlyFee) || 0,
        maxCapacity: Number(maxCapacity) || 30,
      }),
    onSuccess: () => {
      toast.success("Coaching batch created");
      qc.invalidateQueries({ queryKey: ["bd-batches"] });
      setCreateOpen(false);
      setBatchCode("");
      setName("");
      setCourseName("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to create batch"),
  });

  const enrollMutation = useMutation({
    mutationFn: () => {
      if (!enrollBatch) throw new Error("No batch selected");
      return bdApi.enrollInBatch(enrollBatch.id, {
        studentId: studentId.trim(),
        joinDate,
        monthlyFee: enrollBatch.monthly_fee,
      });
    },
    onSuccess: (res: any) => {
      const waitMsg = res?.isWaitlisted
        ? "Batch full — student placed on waitlist"
        : `Enrolled! Pro-rated fee: ৳${res?.feeBreakdown?.payableAmountBdt ?? enrollBatch?.monthly_fee}`;
      toast.success(waitMsg);
      qc.invalidateQueries({ queryKey: ["bd-batches"] });
      setEnrollBatch(null);
      setStudentId("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Enrollment failed"),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Coaching Batches & Waitlist" />
      <main className="p-5 space-y-6 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Coaching Batches, Seat Capacity &amp; Pro-Rated Fees
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage HSC/SSC/Admission coaching batches with automatic waitlist and mid-month pro-rated fee calculation.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Batch
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-40 animate-pulse bg-muted/40" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Layers className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="font-medium">No coaching batches created yet</p>
              <p className="text-sm text-muted-foreground">
                Create a batch to manage seat capacity, waitlists, and monthly coaching fees.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map((b) => {
              const isFull = b.activeCount >= b.max_capacity;
              return (
                <Card key={b.id} className="flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{b.batch_code}</Badge>
                      <Badge variant={isFull ? "destructive" : "default"}>
                        {isFull ? "Full (Waitlisting)" : "Open"}
                      </Badge>
                    </div>
                    <CardTitle className="text-base mt-2">{b.name}</CardTitle>
                    <CardDescription>{b.course_name}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center rounded-md border p-2.5 bg-muted/20">
                      <div>
                        <div className="text-xs text-muted-foreground">Fee/mo</div>
                        <div className="font-semibold text-sm">৳{b.monthly_fee}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Users className="h-3 w-3" /> Seats
                        </div>
                        <div className="font-semibold text-sm">
                          {b.activeCount}/{b.max_capacity}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" /> Waitlist
                        </div>
                        <div className="font-semibold text-sm">{b.waitlistCount}</div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setEnrollBatch(b)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Enroll Student
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Coaching Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Batch Code *</Label>
                  <Input
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    placeholder="HSC26-PHY-A"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Course / Program *</Label>
                  <Input
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="HSC Science 2026"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Batch Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Morning Physics Batch A"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Monthly Fee (BDT)</Label>
                  <Input
                    type="number"
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max Seat Capacity</Label>
                  <Input
                    type="number"
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!batchCode.trim() || !name.trim() || createMutation.isPending}
                >
                  Create Batch
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!enrollBatch} onOpenChange={(o) => !o && setEnrollBatch(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enroll Student in {enrollBatch?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Student ID or Roll Code *</Label>
                <Input
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="e.g., STU-2026-001"
                />
              </div>
              <div className="space-y-1">
                <Label>Join Date (for automatic mid-month pro-rating)</Label>
                <Input
                  type="date"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEnrollBatch(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => enrollMutation.mutate()}
                  disabled={!studentId.trim() || enrollMutation.isPending}
                >
                  Confirm Enrollment
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
