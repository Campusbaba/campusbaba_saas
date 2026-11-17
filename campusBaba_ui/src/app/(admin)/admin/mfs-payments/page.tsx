"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { Smartphone, Check, X } from "lucide-react";

export default function AdminMfsPaymentsPage() {
  const qc = useQueryClient();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["bd-mfs-payments"],
    queryFn: () => bdApi.listMfsPayments(),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "verified" | "rejected" }) =>
      bdApi.verifyMfsPayment(id, { decision }),
    onSuccess: (_, vars) => {
      toast.success(`MFS payment ${vars.decision}`);
      qc.invalidateQueries({ queryKey: ["bd-mfs-payments"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Verification failed"),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="MFS TrxID Verification" />
      <main className="p-5 space-y-6 flex-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            bKash / Nagad / Rocket Manual TrxID Verification
          </h2>
          <p className="text-sm text-muted-foreground">
            Verify or reject student/guardian Mobile Financial Service Transaction IDs before ledger settlement.
          </p>
        </div>

        {isLoading ? (
          <Card className="h-40 animate-pulse bg-muted/40" />
        ) : payments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No manual MFS TrxID submissions yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {payments.map((p: any) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="uppercase">
                      {p.gateway}
                    </Badge>
                    <Badge
                      variant={
                        p.verification_status === "verified"
                          ? "default"
                          : p.verification_status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {p.verification_status}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-2">
                    ৳{p.amount} &bull; {p.transaction_id}
                  </CardTitle>
                  <CardDescription>
                    Student: {p.student_id} &bull; Phone: {p.sender_phone}
                  </CardDescription>
                </CardHeader>
                {p.verification_status === "pending_verification" && (
                  <CardContent className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => verifyMutation.mutate({ id: p.id, decision: "verified" })}
                      disabled={verifyMutation.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" /> Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => verifyMutation.mutate({ id: p.id, decision: "rejected" })}
                      disabled={verifyMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
