"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { bdApi } from "@/lib/bdApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { MessageSquare, Send, CheckCircle2 } from "lucide-react";

function countSmsSegments(text: string) {
  // Detect any non-GSM7 / Unicode characters (e.g. Bangla)
  const isUnicode = /[^\u0000-\u007F]/.test(text);
  const length = text.length;
  if (length === 0) return { encoding: isUnicode ? "UCS-2" : "GSM-7", length: 0, segments: 0, perSegment: isUnicode ? 70 : 160 };
  if (isUnicode) {
    const segments = length <= 70 ? 1 : Math.ceil(length / 67);
    return { encoding: "UCS-2 (Bangla/Unicode)", length, segments, perSegment: length <= 70 ? 70 : 67 };
  }
  const segments = length <= 160 ? 1 : Math.ceil(length / 153);
  return { encoding: "GSM-7 (English)", length, segments, perSegment: length <= 160 ? 160 : 153 };
}

export default function AdminSmsPage() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [senderId, setSenderId] = useState("CAMPUSBABA");
  const [message, setMessage] = useState("");
  const [isPromotional, setIsPromotional] = useState(false);

  const stats = useMemo(() => countSmsSegments(message), [message]);

  const { data: logs = [] } = useQuery({
    queryKey: ["bd-sms-logs"],
    queryFn: () => bdApi.listSmsLogs(),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      bdApi.sendSms({
        to: phone.trim(),
        message,
        senderId: senderId.trim() || "CAMPUSBABA",
        isPromotional,
        tenantSmsCreditsAvailable: 1000,
      }),
    onSuccess: (res: any) => {
      toast.success(`SMS sent (${res?.segmentCount || stats.segments} segment(s))`);
      qc.invalidateQueries({ queryKey: ["bd-sms-logs"] });
      setMessage("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to send SMS"),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="BTRC SMS Broadcast" />
      <main className="p-5 space-y-6 flex-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            BTRC-Compliant SMS Gateway &amp; Segment Counter
          </h2>
          <p className="text-sm text-muted-foreground">
            Send English (GSM-7: 160 chars/segment) or Bangla Unicode (UCS-2: 70 chars/segment) alerts to guardians and students.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Compose SMS</CardTitle>
              <CardDescription>Live GSM-7 vs Bangla UCS-2 segment estimator</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Recipient Phone (BD) *</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+88017XXXXXXXX"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Masking Sender ID</Label>
                  <Input
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value)}
                    placeholder="CAMPUSBABA"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Message Body *</Label>
                <Textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Dear Guardian, tomorrow's Physics Model Test starts at 9:00 AM..."
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>Encoding: <strong>{stats.encoding}</strong></span>
                  <span>{stats.length} chars &bull; <strong>{stats.segments}</strong> SMS segment(s)</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="promo-sms"
                  checked={isPromotional}
                  onCheckedChange={(v) => setIsPromotional(Boolean(v))}
                />
                <Label htmlFor="promo-sms" className="text-xs text-muted-foreground">
                  Promotional SMS (BTRC DND &amp; 8 AM - 8 PM window rules apply)
                </Label>
              </div>

              <Button
                className="w-full"
                onClick={() => sendMutation.mutate()}
                disabled={!phone.trim() || !message.trim() || sendMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMutation.isPending ? "Sending..." : "Send SMS"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent SMS Logs ({logs.length})</CardTitle>
              <CardDescription>Delivered messages &amp; segment usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[420px] overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No SMS messages sent yet.
                </p>
              ) : (
                logs.map((log: any) => (
                  <div key={log.id} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{log.recipient_phone}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{log.encoding}</Badge>
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {log.segment_count} seg
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{log.message_body}</p>
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
