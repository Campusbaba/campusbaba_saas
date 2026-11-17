"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi } from "@/lib/bdApi";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { Smartphone, Send } from "lucide-react";

export default function StudentMfsPayPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [gateway, setGateway] = useState<"bkash" | "nagad" | "rocket" | "upay">("bkash");
  const [invoiceId, setInvoiceId] = useState("INV-2026-001");
  const [amountBdt, setAmountBdt] = useState("2500");
  const [transactionId, setTransactionId] = useState("");
  const [senderPhone, setSenderPhone] = useState("");

  const { data: payments = [] } = useQuery({
    queryKey: ["bd-mfs-payments"],
    queryFn: () => bdApi.listMfsPayments(),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      bdApi.submitMfsPayment({
        invoiceId: invoiceId.trim(),
        studentId: (user as any)?.referenceId || (user as any)?.id || "student",
        amountBdt: Number(amountBdt) || 0,
        gateway,
        transactionId: transactionId.trim(),
        senderPhone: senderPhone.trim(),
      }),
    onSuccess: () => {
      toast.success("TrxID submitted for accountant verification");
      qc.invalidateQueries({ queryKey: ["bd-mfs-payments"] });
      setTransactionId("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Submission failed"),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="bKash / Nagad Fee Payment" />
      <main className="p-5 space-y-6 flex-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Submit bKash / Nagad / Rocket Transaction ID
          </h2>
          <p className="text-sm text-muted-foreground">
            Send your fee via Send Money / Payment and submit your TrxID here for instant accountant verification.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>New TrxID Submission</CardTitle>
              <CardDescription>Duplicate TrxIDs are automatically blocked</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>MFS Gateway</Label>
                  <Select value={gateway} onValueChange={(v: any) => setGateway(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="nagad">Nagad</SelectItem>
                      <SelectItem value="rocket">Rocket</SelectItem>
                      <SelectItem value="upay">Upay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount (BDT)</Label>
                  <Input
                    type="number"
                    value={amountBdt}
                    onChange={(e) => setAmountBdt(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Transaction ID (TrxID) *</Label>
                  <Input
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="e.g., BGD78K291M"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sender Mobile Number *</Label>
                  <Input
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    placeholder="017XXXXXXXX"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice / Fee Reference</Label>
                <Input
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => submitMutation.mutate()}
                disabled={!transactionId.trim() || !senderPhone.trim() || submitMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Submit TrxID
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Submitted TrxIDs ({payments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No MFS payments submitted yet.
                </p>
              ) : (
                payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <div className="font-medium text-sm">
                        {p.gateway?.toUpperCase()} &bull; {p.transaction_id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ৳{p.amount} &bull; {p.sender_phone}
                      </div>
                    </div>
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
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
