"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type NavItem = { id: string; label: string }

export function SectionNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // pick the entry nearest the top that is intersecting
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      // trigger a bit below the sticky header, ignore the lower half of viewport
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 }
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  return (
    <nav className="flex flex-col gap-0.5 text-sm">
      <p className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
        On this page
      </p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={cn(
            "rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
            active === item.id && "bg-input/50 text-foreground"
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
}
