import { cn } from "@/lib/utils"

export type PropRow = {
  name: string
  type: string
  default: string
  description: string
}

export type PropGroup = {
  title: string
  rows: PropRow[]
}

export function PropTable({ groups }: { groups: PropGroup[] }) {
  // min-w makes the wrapper actually scroll on a phone. Without it the table
  // honours `w-full`, squeezes four columns into ~340px and the description
  // turns into one word per line.
  return (
    <div className="overflow-x-auto rounded-xl bg-white/[0.02]">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.02] text-[11px] tracking-wide text-zinc-300 uppercase">
            <th className="px-4 py-2.5 font-medium">Prop</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Default</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows key={group.title} group={group} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ group }: { group: PropGroup }) {
  return (
    <>
      <tr className="border-b border-white/5 bg-white/[0.03]">
        <td
          colSpan={4}
          className="px-4 py-1.5 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase"
        >
          {group.title}
        </td>
      </tr>
      {group.rows.map((row, i) => (
        <tr
          key={row.name}
          className={cn(
            "align-top transition-colors hover:bg-white/[0.02]",
            i < group.rows.length - 1 && "border-b border-white/[0.04]"
          )}
        >
          <td className="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap text-foreground">
            {row.name}
          </td>
          <td className="px-4 py-2.5 font-mono text-[12px] whitespace-pre-wrap text-sky-300/80">
            {row.type}
          </td>
          <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-amber-300/70">
            {row.default}
          </td>
          <td className="max-w-md px-4 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {row.description}
          </td>
        </tr>
      ))}
    </>
  )
}
