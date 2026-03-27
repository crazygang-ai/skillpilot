import SkillList from '@/components/skill/SkillList'
import SkillDetail from '@/components/skill/SkillDetail'

export default function Dashboard() {
  return (
    <div className="flex h-full">
      <div className="w-96 border-r border-border">
        <SkillList />
      </div>
      <div className="flex-1 overflow-hidden">
        <SkillDetail />
      </div>
    </div>
  )
}
