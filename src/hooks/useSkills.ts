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

export function useSkills() {
  return useQuery<Skill[]>({
    queryKey: ['skills'],
    queryFn: () => window.electronAPI.skills.scanAll(),
    staleTime: 10_000,
  })
}

export function useAssignSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ skillPath, agentType }: { skillPath: string; agentType: string }) =>
      window.electronAPI.skills.assign(skillPath, agentType),
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
      window.electronAPI.skills.unassign(skillPath, agentType),
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
      window.electronAPI.skills.removeLocalInstallation(input),
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
      window.electronAPI.skills.delete(skillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useInstallSkill() {
  const queryClient = useQueryClient()
  return useMutation<InstallResult, Error, InstallInput>({
    mutationFn: (input) => window.electronAPI.skills.install(input),
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
      window.electronAPI.skills.installFromLocal(localPath, agentTypes),
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
      window.electronAPI.skills.save(skillId, metadata, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export function useCheckUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skillId: string) =>
      window.electronAPI.skills.checkUpdate(skillId) as Promise<SkillUpdateCheckResult>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export function useCheckAllUpdates() {
  return useMutation({
    mutationFn: () => window.electronAPI.skills.checkAllUpdates(),
  })
}

export function useUpdateSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skillId: string) =>
      window.electronAPI.skills.updateSkill(skillId) as Promise<SkillUpdateApplyResult>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}
