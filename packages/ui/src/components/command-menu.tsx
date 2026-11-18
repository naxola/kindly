'use client'

import { Command } from 'cmdk'
import { Dialog as Primitive } from 'radix-ui'
import { Search } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export interface CommandItem {
  id: string
  label: string
  group: string
  icon?: ReactNode
  keywords?: string[]
  onSelect: () => void
}

/** Command palette (⌘K / Ctrl+K). */
export function CommandMenu({
  open,
  onOpenChange,
  items,
  placeholder,
  emptyLabel,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CommandItem[]
  placeholder: string
  emptyLabel: string
  title: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const groups = [...new Set(items.map((i) => i.group))]

  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Primitive.Content className="fixed top-[15%] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border-strong bg-overlay shadow-2xl">
          <Primitive.Title className="sr-only">{title}</Primitive.Title>
          <Command loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-foreground-lighter" />
              <Command.Input
                placeholder={placeholder}
                className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-sm text-foreground-lighter">
                {emptyLabel}
              </Command.Empty>
              {groups.map((group) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-foreground-lighter"
                >
                  {items
                    .filter((i) => i.group === group)
                    .map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                        onSelect={() => {
                          onOpenChange(false)
                          item.onSelect()
                        }}
                        className="flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm text-foreground-light data-[selected=true]:bg-surface-300 data-[selected=true]:text-foreground [&_svg]:size-4"
                      >
                        {item.icon}
                        {item.label}
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
