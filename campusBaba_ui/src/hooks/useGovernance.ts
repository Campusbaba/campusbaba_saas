"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

export interface TenantGovernanceConfig {
  tenantId: string;
  myRole: string;
  myPermissions: string[];
  featureFlags: {
    library: boolean;
    transport: boolean;
    hostel: boolean;
    sms: boolean;
    onlinePayments: boolean;
    coachingBatches: boolean;
    gpa5Grading: boolean;
    madrasaTrack: boolean;
  };
  rolePermissions: Record<string, string[]>;
  securitySettings: {
    allowQrSelfRegistration: boolean;
    requireAccountantTrxVerification: boolean;
    autoActivateStudentOnPayment: boolean;
    ipAllowlist: string[];
  };
  gradingScheme: {
    name: string;
    maxGpa: number;
    enableFourthSubjectBonus: boolean;
    fourthSubjectDeduction: number;
    failIfAnyMandatoryFailed: boolean;
    gradeBands: Array<{
      minPercentage: number;
      maxPercentage: number;
      letterGrade: string;
      gradePoint: number;
    }>;
  };
  permissionCatalog: Array<{
    code: string;
    module: string;
  }>;
}

export function useGovernance(autoFetch = true) {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["tenant-governance"],
    queryFn: async () => {
      const res = await api.get("/governance/my-config");
      return res.data.data as TenantGovernanceConfig;
    },
    enabled: autoFetch,
    retry: 1,
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (payload: Partial<TenantGovernanceConfig>) => {
      const res = await api.put("/governance/config", payload);
      return res.data.data as TenantGovernanceConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-governance"] });
    },
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async (payload: {
      capability: "sms" | "payment";
      providerCode: string;
      secrets: Record<string, unknown>;
    }) => {
      const res = await api.post("/governance/provider-credentials", payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-governance"] });
    },
  });

  return {
    config: configQuery.data || null,
    loading:
      configQuery.isPending ||
      updateConfigMutation.isPending ||
      saveCredentialsMutation.isPending,
    error: configQuery.error ? configQuery.error.message : null,
    refetch: configQuery.refetch,
    updateConfig: updateConfigMutation.mutateAsync,
    saveCredentials: saveCredentialsMutation.mutateAsync,
  };
}
