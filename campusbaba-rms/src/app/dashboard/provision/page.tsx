"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Globe,
  Mail,
  Lock,
  Users,
  GraduationCap,
  Briefcase,
  CheckCircle,
  DollarSign,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { provisionTenant } from "@/lib/api";
import { toast } from "sonner";

const PLAN_PRESETS: Record<
  string,
  {
    maxStudents: number;
    maxGuardians: number;
    maxTeachers: number;
    maxClasses: number;
    maxAdmins: number;
    perStudentFeeBdt: number;
    orgStudentShareBdt: number;
    platformStudentShareBdt: number;
  }
> = {
  individual_tutor: {
    maxStudents: -1, // Unlimited
    maxGuardians: -1, // Unlimited Free
    maxTeachers: 1, // Strictly 1 teacher
    maxClasses: 20,
    maxAdmins: 1,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
  },
  sme_coaching: {
    maxStudents: -1, // Unlimited
    maxGuardians: -1, // Unlimited Free
    maxTeachers: 10, // 10 teachers for coaching
    maxClasses: 60,
    maxAdmins: 5,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
  },
  campus_connect: {
    maxStudents: -1, // Unlimited
    maxGuardians: -1, // Unlimited Free
    maxTeachers: 100, // School tier
    maxClasses: 150,
    maxAdmins: 15,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
  },
};

export default function ProvisionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    subdomain: "",
    billingPlan: "campus_connect",
    adminEmail: "",
    adminPassword: "",
    maxStudents: -1,
    maxGuardians: -1,
    maxTeachers: 100,
    maxClasses: 150,
    maxAdmins: 15,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
  });

  const handlePlanChange = (planCode: string) => {
    const preset = PLAN_PRESETS[planCode];
    setFormData((prev) => ({
      ...prev,
      billingPlan: planCode,
      ...(preset || {}),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await provisionTenant(formData);
      toast.success("Organization provisioned successfully!", {
        description: `${formData.name} is now ready at ${formData.subdomain}.campusbaba.com`,
      });
      setTimeout(() => router.push("/dashboard/organizations"), 1500);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || "Failed to provision tenant"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-2 animate-fade-in">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Provision New Organization & Subscription Tier
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Set up an Individual Tutor, SME Coaching Center, or Campus Connect School with customizable registration caps and per-student revenue split.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Organization Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Organization Details & Subscription Plan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Organization Name</Label>
                  <Input
                    required
                    placeholder="e.g. Dhaka Public School"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Subdomain</Label>
                  <div className="flex mt-1.5">
                    <Input
                      required
                      placeholder="dhakapublic"
                      value={formData.subdomain}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          subdomain: e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, ""),
                        })
                      }
                      className="rounded-r-none"
                    />
                    <span className="inline-flex items-center px-2.5 rounded-r-lg border border-l-0 border-input bg-secondary text-muted-foreground text-xs whitespace-nowrap">
                      .campusbaba.com
                    </span>
                  </div>
                </div>
                <div>
                  <Label>Subscription Tier</Label>
                  <Select
                    value={formData.billingPlan}
                    onValueChange={(v) => handlePlanChange(v || "campus_connect")}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual_tutor">
                        Individual Tutor (1 Teacher, ∞ Students)
                      </SelectItem>
                      <SelectItem value="sme_coaching">
                        SME Coaching Plan (10 Teachers)
                      </SelectItem>
                      <SelectItem value="campus_connect">
                        Campus Connect Plan (School/College)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Registration Quotas */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Registration Limits (Set `-1` for Unlimited ∞)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5" />
                    Max Students
                  </Label>
                  <Input
                    required
                    type="number"
                    min={-1}
                    value={formData.maxStudents}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxStudents: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    Max Guardians
                  </Label>
                  <Input
                    required
                    type="number"
                    min={-1}
                    value={formData.maxGuardians}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxGuardians: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    Max Teachers
                  </Label>
                  <Input
                    required
                    type="number"
                    min={1}
                    value={formData.maxTeachers}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxTeachers: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Classes</Label>
                  <Input
                    required
                    type="number"
                    min={-1}
                    value={formData.maxClasses}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxClasses: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Admins</Label>
                  <Input
                    required
                    type="number"
                    min={1}
                    value={formData.maxAdmins}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxAdmins: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Per-Student Revenue Split & Guardian Portal */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Per-Student Billing Split & Free Guardian Portal Policy
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Per-Student Charge (৳ Total)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.perStudentFeeBdt}
                    onChange={(e) => {
                      const total = +e.target.value;
                      setFormData({
                        ...formData,
                        perStudentFeeBdt: total,
                        platformStudentShareBdt: Math.max(
                          0,
                          total - formData.orgStudentShareBdt
                        ),
                      });
                    }}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Organization Share (৳)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.orgStudentShareBdt}
                    onChange={(e) => {
                      const orgShare = +e.target.value;
                      setFormData({
                        ...formData,
                        orgStudentShareBdt: orgShare,
                        platformStudentShareBdt: Math.max(
                          0,
                          formData.perStudentFeeBdt - orgShare
                        ),
                      });
                    }}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">CampusBaba Share (৳ Ours)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.platformStudentShareBdt}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        platformStudentShareBdt: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20 text-xs">
                <div>
                  <p className="font-semibold">
                    Guardian Portal is Free (৳0 Charge) — Allow 1 Guardian to Monitor Multiple Students
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Toggle ON for multi-sibling guardian monitoring, or OFF to enforce 1 Guardian : 1 Student.
                  </p>
                </div>
                <Switch
                  checked={formData.guardianMultiStudentAllowed}
                  onCheckedChange={(v) =>
                    setFormData({ ...formData, guardianMultiStudentAllowed: v })
                  }
                />
              </div>
            </div>

            <Separator />

            {/* Admin Credentials */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Initial Administrator
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Admin Email</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      required
                      type="email"
                      placeholder="admin@school.edu.bd"
                      value={formData.adminEmail}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          adminEmail: e.target.value,
                        })
                      }
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <Label>Temporary Password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      required
                      type="password"
                      minLength={6}
                      placeholder="Min 6 characters"
                      value={formData.adminPassword}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          adminPassword: e.target.value,
                        })
                      }
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/organizations")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="gradient-primary text-white hover:opacity-90 min-w-[200px]"
              >
                {loading ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Provisioning...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Provision Organization
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
