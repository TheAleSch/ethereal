import { CopyButton } from "@/components/home/copy-button"
import { cn } from "@/lib/utils"

/**
 * Quiet, self-contained code surface with a copy affordance.
 * `label` renders a small file/context chip in the header row.
 */
export function CodeBlock({
  code,
  label,
  meta,
  className,
}: {
  code: string
  label?: string
  /** small right-aligned note in the header row (e.g. a bundle-size chip) */
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="code-block"
      className={cn(
        "group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2">
        <span className="font-mono text-xs tracking-wide text-muted-foreground">
          {label ?? "shell"}
        </span>
        {meta && (
          <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
            {meta}
          </span>
        )}
        <CopyButton value={code} className={cn("size-7", !meta && "ml-auto")} />
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[0.8rem] leading-relaxed">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
    </div>
  )
}
