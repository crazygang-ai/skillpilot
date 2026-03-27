import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Skill,
  InstallInput,
  InstallResult,
  RemoveLocalInstallationInput,
  SkillUpdateApplyResult,
  SkillUpdateCheckResult,
  SkillMetadata,
} from '@/types'
import api from '@/services/ipcClient'

export function useSkills() {
  return useQuery<Skill[]>({
    queryKey: ['skills'],
    queryFn: () => api.skills.scanAll(),
    staleTime: 10_000,
  })
}

export function useAssignSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ skillPath, agentType }: { skillPath: string; agentType: string }) =>
      api.skills.assign(skillPath, agentType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useUnassignSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ skillPath, agentType }: { skillPath: string; agentType: string }) =>
      api.skills.unassign(skillPath, agentType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useRemoveLocalInstallation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RemoveLocalInstallationInput) =>
      api.skills.removeLocalInstallation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useDeleteSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ skillId }: { skillId: string }) =>
      api.skills.delete(skillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useInstallSkill() {
  const queryClient = useQueryClient()
  return useMutation<InstallResult, Error, InstallInput>({
    mutationFn: (input) => api.skills.install(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useInstallSkillFromLocal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ localPath, agentTypes }: { localPath: string; agentTypes: string[] }) =>
      api.skills.installFromLocal(localPath, agentTypes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useSaveSkillMD() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ skillId, metadata, body }: { skillId: string; metadata: SkillMetadata; body: string }) =>
      api.skills.save(skillId, metadata, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export function useCheckUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skillId: string) =>
      api.skills.checkUpdate(skillId) as Promise<SkillUpdateCheckResult>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export function useCheckAllUpdates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.skills.checkAllUpdates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export function useUpdateSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skillId: string) =>
      api.skills.updateSkill(skillId) as Promise<SkillUpdateApplyResult>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}
